import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL =
  "https://api.tiny.com.br/api2";

/*
 * Usamos um valor conservador.
 * O frontend fará as pausas entre as chamadas.
 */
const DEFAULT_LIMIT_PER_MINUTE = 20;

const MAX_SEARCH_PAGES = 100;

/*
 * O Tiny permite concorrência de até 1/4 do limite por minuto.
 * Mantemos um teto próprio para não abrir chamadas demais de uma vez.
 */
const MAX_TINY_CONCURRENCY = 15;
const MAX_STOCK_BATCH = MAX_TINY_CONCURRENCY;
const RATE_LIMIT_SAFETY_MS = 250;

const PLACEHOLDER_IMAGE =
  "https://via.placeholder.com/300";

type SyncType =
  | "geral"
  | "estoque"
  | "novos_produtos";

type Action =
  | "sync"
  | "start"
  | "details"
  | "stock"
  | "finish";

type TinyGrade =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | null
  | undefined;

type TinyVariation = {
  id?: string | number;
  codigo?: string;
  nome?: string;
  preco?: string | number;
  preco_promocional?: string | number;
  estoque_atual?: string | number;
  grade?: TinyGrade;
};

type TinyProduct = {
  id?: string | number;
  nome?: string;
  codigo?: string;

  preco?: string | number;
  preco_promocional?: string | number;

  descricao_complementar?: string;
  obs?: string;

  tipo?: string;

  /*
   * N = normal
   * P = pai
   * V = variação
   */
  tipoVariacao?: string;

  idProdutoPai?: string | number;

  situacao?: string;

  categoria?: string;

  estoque_atual?: string | number;

  grade?: TinyGrade;

  variacoes?: unknown;

  anexos?: Array<{
    anexo?: string;
  }>;

  imagens_externas?: Array<{
    imagem_externa?: {
      url?: string;
    };
  }>;
};

type TinyUpdatedStockProduct = {
  id?: string | number;
  nome?: string;
  codigo?: string;
  tipo_variacao?: string;
  tipoVariacao?: string;
  saldo?: string | number;
  data_alteracao?: string;
  idProdutoPai?: string | number;
  id_produto_pai?: string | number;
};

type TinyUpdatedProduct = TinyProduct & {
  data_alteracao?: string;
  data_criacao?: string;
  tipo_variacao?: string;
  id_produto_pai?: string | number;
};

type TinyStockProduct =
  TinyProduct & {
    saldo?: string | number;

    saldoReservado?: string | number;

    depositos?: Array<{
      deposito?: {
        id?: string | number;
        nome?: string;
        desconsiderar?: string;
        saldo?: string | number;
        saldoReservado?: string | number;
        empresa?: string;
      };
    }>;
  };

type TinyResponse = {
  retorno?: {
    status?: string;

    status_processamento?:
      | string
      | number;

    codigo_erro?:
      | string
      | number;

    mensagem?: string;

    erros?: Array<{
      erro?: string;
      descricao?: string;
    }>;

    pagina?:
      | string
      | number;

    numero_paginas?:
      | string
      | number;

    produtos?: Array<{
      produto?: TinyProduct;
    }>;

    produto?: TinyStockProduct;
  };
};

/*
 * =========================================================
 * MAPA DE VARIAÇÕES SALVO NO BANCO
 * =========================================================
 *
 * É esse objeto que será utilizado posteriormente
 * pela confirmação do pedido para descobrir:
 *
 * tamanho + cor -> ID da variação no Tiny
 */

type StartVariation = {
  id: string;
  codigo: string;
  tamanho: string;
  cor: string;
  /** Estoque que já veio na pesquisa/detalhes do Tiny, quando disponível. */
  saldoInicial?: number;
};

type StartGroup = {
  id: string;

  nome: string;

  descricao: string;

  preco: number;

  precoPromocional:
    number | null;

  imagens: string[];

  tipoVariacao: string;

  variations:
    StartVariation[];
};

type StockResult = {
  id: string;

  saldo: number;
};

/* =========================================================
 * UTILITÁRIOS
 * =======================================================*/

function text(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function toNumber(
  value: unknown
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return 0;
  }

  /*
   * Tiny normalmente usa ponto decimal.
   *
   * Também aceitamos formato brasileiro.
   */
  const normalized =
    raw.includes(",")
      ? raw
          .replace(/\./g, "")
          .replace(",", ".")
      : raw;

  const result =
    Number(normalized);

  return Number.isFinite(
    result
  )
    ? result
    : 0;
}

function optionalNumber(
  value: unknown
): number | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return undefined;
  }

  const result =
    toNumber(value);

  return Number.isFinite(
    result
  )
    ? result
    : undefined;
}

function normalize(
  value: string
): string {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim();
}

function sleep(
  ms: number
): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function concurrentLimit(
  apiLimit: number
): number {
  const safeLimit =
    Number.isFinite(apiLimit) &&
    apiLimit > 0
      ? Math.floor(apiLimit / 4)
      : 1;

  return Math.max(
    1,
    Math.min(
      MAX_TINY_CONCURRENCY,
      safeLimit
    )
  );
}

function waitForRateLimit(
  calls: number,
  apiLimit: number,
  elapsedMs = 0
): number {
  if (calls <= 0 || apiLimit <= 0) {
    return 0;
  }

  const intervaloNecessario =
    Math.ceil(
      (calls * 60000) /
        apiLimit
    ) + RATE_LIMIT_SAFETY_MS;

  return Math.max(
    0,
    intervaloNecessario -
      Math.max(0, elapsedMs)
  );
}

/* =========================================================
 * ORDENAÇÃO DE TAMANHOS
 * =======================================================*/

function tamanhoPeso(
  tamanho: string
): number {
  const raw =
    normalize(
      tamanho
    );

  /*
   * Numéricos:
   * 1, 2, 3 ... 16
   */
  const numeric =
    Number(raw);

  if (
    Number.isFinite(
      numeric
    )
  ) {
    return numeric;
  }

  /*
   * Adulto / infantil
   */
  const especiais: Record<
    string,
    number
  > = {
    rn: 50,
    pp: 100,
    p: 200,
    m: 300,
    g: 400,
    gg: 500,
    xg: 600,
    xgg: 600,
    xxg: 700,
    xxgg: 700,
    xxxg: 800,
    eg: 800,
    egg: 900,
    unico: 11000,
  };

  if (
    especiais[raw] !==
    undefined
  ) {
    return especiais[raw];
  }

  /*
   * Exemplos:
   * 2/3
   * 4/6
   * 10/12
   */
  const match =
    raw.match(
      /^(\d+)/
    );

  if (match) {
    return Number(
      match[1]
    );
  }

  return 10000;
}

function ordenarTamanhos(
  tamanhos: string[]
): string[] {
  return [
    ...new Set(
      tamanhos.filter(
        Boolean
      )
    ),
  ].sort(
    (a, b) => {
      const pesoA =
        tamanhoPeso(a);

      const pesoB =
        tamanhoPeso(b);

      if (
        pesoA !== pesoB
      ) {
        return (
          pesoA -
          pesoB
        );
      }

      return a.localeCompare(
        b,
        "pt-BR",
        {
          numeric: true,
        }
      );
    }
  );
}

/* =========================================================
 * MENSAGEM DE ERRO TINY
 * =======================================================*/

function tinyErrorMessage(
  data: TinyResponse,
  fallback =
    "O Tiny não retornou os dados solicitados."
): string {
  const errors =
    (
      data.retorno
        ?.erros ?? []
    )
      .map(
        (item) =>
          text(
            item?.erro
          ) ||
          text(
            item?.descricao
          )
      )
      .filter(Boolean);

  if (
    errors.length > 0
  ) {
    return errors.join(
      " | "
    );
  }

  const mensagem =
    text(
      data.retorno
        ?.mensagem
    );

  if (mensagem) {
    return mensagem;
  }

  return fallback;
}

/* =========================================================
 * CHAMADA TINY
 * =======================================================*/

/* =========================================================
 * LIMITADOR GLOBAL DA SINCRONIZAÇÃO
 *
 * A versão anterior limitava cada etapa separadamente.
 * Como start/details/stock eram requisições HTTP diferentes,
 * os limites acabavam sendo somados e o Tiny bloqueava a API.
 *
 * Nesta versão toda a sincronização roda em UMA chamada do
 * nosso backend e este limitador controla TODAS as chamadas
 * ao Tiny durante a execução.
 * =======================================================*/
class TinyRequestLimiter {
  private apiLimit: number;
  private active = 0;
  private timestamps: number[] = [];
  private blockedUntil = 0;

  constructor(initialLimit = DEFAULT_LIMIT_PER_MINUTE) {
    this.apiLimit = Math.max(1, Math.floor(initialLimit) || DEFAULT_LIMIT_PER_MINUTE);
  }

  updateLimit(limit: number) {
    if (Number.isFinite(limit) && limit > 0) {
      this.apiLimit = Math.max(1, Math.floor(limit));
    }
  }

  blockFor(ms: number) {
    this.blockedUntil = Math.max(
      this.blockedUntil,
      Date.now() + Math.max(0, ms)
    );
  }

  private concurrency(): number {
    // Limite oficial: concorrência máxima = 1/4 do limite por minuto.
    return Math.max(
      1,
      Math.min(
        MAX_TINY_CONCURRENCY,
        Math.floor(this.apiLimit / 4) || 1
      )
    );
  }

  private prune() {
    const cutoff = Date.now() - 60_000;
    this.timestamps = this.timestamps.filter(
      (timestamp) => timestamp > cutoff
    );
  }

  getLimit(): number {
    return this.apiLimit;
  }

  private waitTime(): number {
    this.prune();

    const now = Date.now();
    const waits: number[] = [];

    if (this.blockedUntil > now) {
      waits.push(this.blockedUntil - now);
    }

    if (this.active >= this.concurrency()) {
      waits.push(100);
    }

    if (this.timestamps.length >= this.apiLimit) {
      const oldest = this.timestamps[0] ?? now;
      waits.push(
        Math.max(
          100,
          oldest + 60_000 + RATE_LIMIT_SAFETY_MS - now
        )
      );
    }

    return waits.length > 0 ? Math.max(...waits) : 0;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    while (true) {
      const wait = this.waitTime();

      if (wait <= 0) {
        this.prune();
        this.active += 1;
        this.timestamps.push(Date.now());
        break;
      }

      await sleep(wait);
    }

    try {
      return await task();
    } finally {
      this.active = Math.max(0, this.active - 1);
    }
  }
}

function isTinyEmptyQueueError(data: TinyResponse): boolean {
  const codigo = toNumber(data.retorno?.codigo_erro);
  const message = normalize(tinyErrorMessage(data, ""));

  return (
    codigo === 20 ||
    message.includes("consulta nao retornou registros") ||
    message.includes("nao retornou registros")
  );
}

async function tinyPost<T>(
  endpoint: string,
  params: Record<
    string,
    string | number
  >,
  limiter?: TinyRequestLimiter,
  options?: {
    allowEmptyQueue?: boolean;
  }
): Promise<{
  data: T;
  headers: Headers;
  status: number;
}> {
  const token =
    process.env
      .TINY_API_TOKEN
      ?.trim();

  if (!token) {
    throw new Error(
      "Variável TINY_API_TOKEN não encontrada."
    );
  }

  const body =
    new URLSearchParams();

  body.set(
    "token",
    token
  );

  body.set(
    "formato",
    "json"
  );

  for (
    const [key, value] of
    Object.entries(
      params
    )
  ) {
    body.set(
      key,
      String(value)
    );
  }

  const execute = () =>
    fetch(
      `${TINY_BASE_URL}/${endpoint}`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          Accept:
            "application/json",
        },

        body:
          body.toString(),

        cache:
          "no-store",
      }
    );

  const response = limiter
    ? await limiter.run(execute)
    : await execute();

  const raw =
    await response.text();

  let data: T;

  try {
    data =
      JSON.parse(
        raw
      ) as T;
  } catch {
    throw new Error(
      `Resposta inválida do Tiny em ${endpoint}. HTTP ${response.status}.`
    );
  }

  const typedData =
    data as
      T &
      TinyResponse;

  if (limiter) {
    const headerLimit = limitFromHeaders(response.headers);

    if (headerLimit > 0) {
      limiter.updateLimit(headerLimit);
    }
  }

  const message =
    tinyErrorMessage(
      typedData,
      `Erro HTTP ${response.status}.`
    );

  const normalized =
    normalize(
      message
    );

  /*
   * Bloqueio temporário.
   */
  if (
    response.status ===
      429 ||
    normalized.includes(
      "api bloqueada"
    ) ||
    normalized.includes(
      "excedido o numero de acessos"
    )
  ) {
    limiter?.blockFor(180_000);

    throw new Error(
      "API Bloqueada - Excedido o número de acessos a API, aguarde alguns minutos e tente novamente. O botão foi interrompido para evitar novas requisições."
    );
  }

  if (
    !response.ok
  ) {
    throw new Error(
      `Tiny respondeu HTTP ${response.status} em ${endpoint}: ${message}`
    );
  }

  if (
    typedData.retorno
      ?.status ===
      "Erro"
  ) {
    const emptyQueue = isTinyEmptyQueueError(typedData);

    if (!emptyQueue || !options?.allowEmptyQueue) {
      throw new Error(message);
    }
  }

  return {
    data,

    headers:
      response.headers,

    status:
      response.status,
  };
}

/* =========================================================
 * IMAGENS
 * =======================================================*/

function extractImages(
  product: TinyProduct
): string[] {
  const urls:
    string[] = [];

  for (
    const item of
    product.anexos ??
    []
  ) {
    const url =
      text(
        item?.anexo
      );

    if (url) {
      urls.push(url);
    }
  }

  for (
    const item of
    product.imagens_externas ??
    []
  ) {
    const url =
      text(
        item
          ?.imagem_externa
          ?.url
      );

    if (url) {
      urls.push(url);
    }
  }

  return [
    ...new Set(
      urls
    ),
  ];
}

/* =========================================================
 * GRADE
 * =======================================================*/

function gradeFromTiny(
  grade: TinyGrade
): {
  tamanho: string;
  cor: string;
} {
  let tamanho = "";
  let cor = "";

  const inspect = (
    rawKey: unknown,
    rawValue: unknown
  ) => {
    const key =
      normalize(
        text(
          rawKey
        )
      );

    const value =
      text(
        rawValue
      );

    if (
      !key ||
      !value
    ) {
      return;
    }

    if (
      !tamanho &&
      (
        key.includes(
          "tamanho"
        ) ||
        key ===
          "tam" ||
        key.includes(
          "size"
        )
      )
    ) {
      tamanho =
        value;
    }

    if (
      !cor &&
      (
        key.includes(
          "cor"
        ) ||
        key.includes(
          "color"
        ) ||
        key.includes(
          "colour"
        )
      )
    ) {
      cor =
        value;
    }
  };

  if (
    Array.isArray(
      grade
    )
  ) {
    for (
      const item of
      grade
    ) {
      if (
        !item ||
        typeof item !==
          "object" ||
        Array.isArray(
          item
        )
      ) {
        continue;
      }

      for (
        const [
          key,
          value,
        ] of Object.entries(
          item
        )
      ) {
        inspect(
          key,
          value
        );
      }
    }
  } else if (
    grade &&
    typeof grade ===
      "object"
  ) {
    for (
      const [
        key,
        value,
      ] of Object.entries(
        grade
      )
    ) {
      inspect(
        key,
        value
      );
    }
  }

  return {
    tamanho,
    cor,
  };
}

function gradeFromName(
  name: string
): {
  tamanho: string;
  cor: string;
} {
  const parts =
    name
      .split(
        " - "
      )
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  if (
    parts.length <
    3
  ) {
    return {
      tamanho: "",
      cor: "",
    };
  }

  return {
    tamanho:
      parts[
        parts.length - 2
      ] ?? "",

    cor:
      parts[
        parts.length - 1
      ] ?? "",
  };
}

function baseName(
  name: string
): string {
  const parts =
    name
      .split(
        " - "
      )
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  if (
    parts.length >=
    3
  ) {
    return parts
      .slice(
        0,
        -2
      )
      .join(
        " - "
      )
      .trim();
  }

  return name.trim();
}

/* =========================================================
 * VARIAÇÕES
 * =======================================================*/

function normalizeVariations(
  raw: unknown
): TinyVariation[] {
  if (!raw) {
    return [];
  }

  const result:
    TinyVariation[] = [];

  const pushCandidate = (
    value: unknown
  ) => {
    if (
      !value ||
      typeof value !==
        "object" ||
      Array.isArray(
        value
      )
    ) {
      return;
    }

    const obj =
      value as Record<
        string,
        unknown
      >;

    let candidate:
      unknown = value;

    if (
      obj.variacao &&
      typeof obj.variacao ===
        "object" &&
      !Array.isArray(
        obj.variacao
      )
    ) {
      candidate =
        obj.variacao;
    }

    if (
      !candidate ||
      typeof candidate !==
        "object" ||
      Array.isArray(
        candidate
      )
    ) {
      return;
    }

    const variation =
      candidate as
        TinyVariation;

    const id =
      text(
        variation.id
      );

    if (!id) {
      return;
    }

    result.push(
      variation
    );
  };

  if (
    Array.isArray(
      raw
    )
  ) {
    for (
      const item of
      raw
    ) {
      pushCandidate(
        item
      );
    }
  } else if (
    typeof raw ===
      "object"
  ) {
    for (
      const item of
      Object.values(
        raw as Record<
          string,
          unknown
        >
      )
    ) {
      pushCandidate(
        item
      );
    }
  }

  const unique =
    new Map<
      string,
      TinyVariation
    >();

  for (
    const item of
    result
  ) {
    unique.set(
      text(
        item.id
      ),
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

/* =========================================================
 * PESQUISA
 * =======================================================*/

async function searchAllProducts(): Promise<{
  products: TinyProduct[];
  apiLimit: number;
  paginas: number;
}> {
  const products: TinyProduct[] = [];

  let apiLimit =
    DEFAULT_LIMIT_PER_MINUTE;

  /*
   * Primeira página: precisamos dela para descobrir
   * quantas páginas existem.
   */
  const primeira =
    await tinyPost<TinyResponse>(
      "produtos.pesquisa.php",
      {
        pesquisa: "",
        pagina: 1,
      }
    );

  apiLimit =
    limitFromHeaders(
      primeira.headers
    );

  const retornoInicial =
    primeira.data.retorno;

  if (
    !retornoInicial ||
    retornoInicial.status !== "OK"
  ) {
    throw new Error(
      tinyErrorMessage(
        primeira.data
      )
    );
  }

  const adicionarProdutos = (
    data: TinyResponse
  ) => {
    for (
      const item of
        data.retorno?.produtos ?? []
    ) {
      const product =
        item?.produto;

      if (!product?.id) {
        continue;
      }

      if (
        normalize(
          text(product.situacao)
        ) === "e"
      ) {
        continue;
      }

      products.push(product);
    }
  };

  adicionarProdutos(
    primeira.data
  );

  const totalPages =
    Math.min(
      MAX_SEARCH_PAGES,
      toNumber(
        retornoInicial.numero_paginas
      ) || 1
    );

  if (totalPages <= 1) {
    return {
      products: deduplicarProdutos(products),
      apiLimit,
      paginas: totalPages,
    };
  }

  const concurrency =
    concurrentLimit(apiLimit);

  /*
   * As páginas 2..N são independentes.
   * Em vez de aguardar 1,5 s entre cada uma,
   * buscamos em ondas respeitando a concorrência
   * máxima do Tiny e aguardando o intervalo
   * necessário entre ondas.
   */
  for (
    let paginaInicial = 2;
    paginaInicial <= totalPages;
    paginaInicial += concurrency
  ) {
    const paginasDoLote =
      Array.from(
        { length: concurrency },
        (_, index) =>
          paginaInicial + index
      ).filter(
        (pagina) =>
          pagina <= totalPages
      );

    const startedAt =
      Date.now();

    const respostas =
      await Promise.all(
        paginasDoLote.map(
          (pagina) =>
            tinyPost<TinyResponse>(
              "produtos.pesquisa.php",
              {
                pesquisa: "",
                pagina,
              }
            )
        )
      );

    for (
      const resposta of respostas
    ) {
      const retorno =
        resposta.data.retorno;

      if (
        !retorno ||
        retorno.status !== "OK"
      ) {
        throw new Error(
          tinyErrorMessage(
            resposta.data
          )
        );
      }

      adicionarProdutos(
        resposta.data
      );

      const headerLimit =
        limitFromHeaders(
          resposta.headers
        );

      if (headerLimit > 0) {
        apiLimit = Math.min(
          apiLimit,
          headerLimit
        );
      }
    }

    if (
      paginaInicial +
        concurrency <=
      totalPages
    ) {
      await sleep(
        waitForRateLimit(
          paginasDoLote.length,
          apiLimit,
          Date.now() - startedAt
        )
      );
    }
  }

  return {
    products:
      deduplicarProdutos(products),
    apiLimit,
    paginas: totalPages,
  };
}

function deduplicarProdutos(
  products: TinyProduct[]
): TinyProduct[] {
  const unique =
    new Map<string, TinyProduct>();

  for (
    const product of products
  ) {
    const id =
      text(product.id);

    if (id) {
      unique.set(id, product);
    }
  }

  return [
    ...unique.values(),
  ];
}

function limitFromHeaders(
  headers: Headers
): number {
  const value =
    Number(
      headers.get(
        "x-limit-api"
      )
    );

  if (
    Number.isFinite(
      value
    ) &&
    value > 0
  ) {
    return value;
  }

  return DEFAULT_LIMIT_PER_MINUTE;
}

/* =========================================================
 * START
 *
 * N = produto simples
 * P = produto pai
 *
 * V é relacionada ao P diretamente pela pesquisa quando o Tiny
 * informa idProdutoPai. DETAILS fica apenas como fallback.
 * =======================================================*/

function buildStartGroups(
  products: TinyProduct[]
): {
  groups: StartGroup[];

  normais: number;

  pais: number;

  variacoes: number;
} {
  const groups:
    StartGroup[] = [];

  let normais = 0;

  let pais = 0;

  let variacoes = 0;

  /*
   * PRODUTOS NORMAIS
   */
  for (
    const product of
    products
  ) {
    const tipo =
      text(
        product.tipoVariacao
      ).toUpperCase();

    if (
      tipo !== "N"
    ) {
      continue;
    }

    const id =
      text(
        product.id
      );

    if (!id) {
      continue;
    }

    normais++;

    const nome =
      text(
        product.nome
      ) ||
      `Produto ${id}`;

    const grade =
      gradeFromTiny(
        product.grade
      );

    groups.push({
      id,

      nome:
        baseName(
          nome
        ) || nome,

      descricao:
        text(
          product
            .descricao_complementar
        ) ||
        text(
          product.obs
        ) ||
        nome,

      preco:
        toNumber(
          product.preco
        ),

      precoPromocional:
        optionalNumber(
          product
            .preco_promocional
        ) ?? null,

      imagens:
        extractImages(
          product
        ),

      tipoVariacao:
        "N",

      variations: [
        {
          id,

          codigo:
            text(
              product.codigo
            ),

          tamanho:
            grade.tamanho,

          cor:
            grade.cor,

          saldoInicial:
            optionalNumber(product.estoque_atual),
        },
      ],
    });
  }

  /*
   * PRODUTOS PAIS
   */
  for (
    const product of
    products
  ) {
    const tipo =
      text(
        product.tipoVariacao
      ).toUpperCase();

    if (
      tipo !== "P"
    ) {
      continue;
    }

    const id =
      text(
        product.id
      );

    if (!id) {
      continue;
    }

    pais++;

    const nome =
      text(
        product.nome
      ) ||
      `Produto ${id}`;

    groups.push({
      id,

      nome:
        baseName(
          nome
        ) || nome,

      descricao:
        text(
          product
            .descricao_complementar
        ) ||
        text(
          product.obs
        ) ||
        nome,

      preco:
        toNumber(
          product.preco
        ),

      precoPromocional:
        optionalNumber(
          product
            .preco_promocional
        ) ?? null,

      imagens:
        extractImages(
          product
        ),

      tipoVariacao:
        "P",

      /*
       * As V são vinculadas abaixo pela pesquisa do catálogo.
       * DETAILS será usado somente se nenhuma V for encontrada.
       */
      variations: [],
    });
  }

  /*
   * VARIAÇÕES V:
   * A pesquisa do catálogo já informa o idProdutoPai.
   * Quando conseguimos relacionar a V ao P, montamos o grupo
   * imediatamente e evitamos uma chamada extra de DETAILS.
   * O DETAILS continua como fallback somente para P sem V.
   */
  const paisPorId =
    new Map<string, StartGroup>();

  for (
    const group of groups
  ) {
    if (
      group.tipoVariacao ===
      "P"
    ) {
      paisPorId.set(
        group.id,
        group
      );
    }
  }

  variacoes =
    products.filter(
      (product) =>
        text(
          product.tipoVariacao
        ).toUpperCase() ===
        "V"
    ).length;

  for (
    const product of
    products
  ) {
    if (
      text(
        product.tipoVariacao
      ).toUpperCase() !==
      "V"
    ) {
      continue;
    }

    const variationId =
      text(
        product.id
      );

    const parentId =
      text(
        product.idProdutoPai
      );

    if (
      !variationId ||
      !parentId
    ) {
      continue;
    }

    const parent =
      paisPorId.get(
        parentId
      );

    if (!parent) {
      continue;
    }

    const duplicate =
      parent.variations.some(
        (variation) =>
          variation.id ===
          variationId
      );

    if (duplicate) {
      continue;
    }

    let grade =
      gradeFromTiny(
        product.grade
      );

    if (
      (!grade.tamanho ||
        !grade.cor) &&
      text(product.nome)
    ) {
      const gradeNome =
        gradeFromName(
          text(product.nome)
        );

      if (!grade.tamanho) {
        grade.tamanho =
          gradeNome.tamanho;
      }

      if (!grade.cor) {
        grade.cor =
          gradeNome.cor;
      }
    }

    parent.variations.push({
      id: variationId,
      codigo: text(
        product.codigo
      ),
      tamanho: grade.tamanho,
      cor: grade.cor,
      saldoInicial:
        optionalNumber(product.estoque_atual),
    });
  }

  for (
    const group of groups
  ) {
    if (
      group.tipoVariacao !==
      "P"
    ) {
      continue;
    }

    group.variations.sort(
      (a, b) => {
        const pesoA =
          tamanhoPeso(a.tamanho);

        const pesoB =
          tamanhoPeso(b.tamanho);

        if (pesoA !== pesoB) {
          return pesoA - pesoB;
        }

        return a.cor.localeCompare(
          b.cor,
          "pt-BR"
        );
      }
    );
  }

  /*
   * Ordena os grupos.
   *
   * Normais primeiro, pais depois.
   */
  groups.sort(
    (a, b) => {
      if (
        a.tipoVariacao !==
        b.tipoVariacao
      ) {
        return a.tipoVariacao ===
          "N"
          ? -1
          : 1;
      }

      return a.nome.localeCompare(
        b.nome,
        "pt-BR"
      );
    }
  );

  return {
    groups,

    normais,

    pais,

    variacoes,
  };
}

/* =========================================================
 * DETAILS
 *
 * Fonte oficial das variações do P.
 * =======================================================*/

async function getProductDetails(
  id: string,
  limiter?: TinyRequestLimiter
): Promise<TinyProduct> {
  const response =
    await tinyPost<
      TinyResponse
    >(
      "produto.obter.php",
      {
        id,
      },
      limiter
    );

  const retorno =
    response.data
      .retorno;

  if (
    !retorno ||
    retorno.status !==
      "OK" ||
    !retorno.produto
  ) {
    throw new Error(
      tinyErrorMessage(
        response.data
      )
    );
  }

  return retorno.produto;
}

/* =========================================================
 * MONTA O GRUPO COMPLETO A PARTIR DO PAI
 * =======================================================*/

function buildDetailedGroup(
  group: StartGroup,
  product: TinyProduct
): StartGroup {
  const variations =
    normalizeVariations(
      product.variacoes
    );

  /*
   * IDs únicos.
   */
  const seen =
    new Set<string>();

  const normalized:
    StartVariation[] =
    [];

  for (
    const variation of
    variations
  ) {
    const id =
      text(
        variation.id
      );

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    let grade =
      gradeFromTiny(
        variation.grade
      );

    /*
     * Fallback apenas para casos
     * em que a grade não veio.
     */
    if (
      !grade.tamanho &&
      !grade.cor
    ) {
      grade =
        gradeFromName(
          text(
            variation.nome
          )
        );
    }

    normalized.push({
      id,

      /*
       * Guardamos também o código
       * exato da variação no Tiny.
       */
      codigo:
        text(
          variation.codigo
        ),

      tamanho:
        grade.tamanho,

      cor:
        grade.cor,

      saldoInicial:
        optionalNumber(variation.estoque_atual),
    });
  }

  /*
   * Ordenação:
   * PP → P → M → G → GG
   * ou
   * 1 → 2 → 3 ... 16
   */
  normalized.sort(
    (a, b) => {
      const pesoA =
        tamanhoPeso(
          a.tamanho
        );

      const pesoB =
        tamanhoPeso(
          b.tamanho
        );

      if (
        pesoA !==
        pesoB
      ) {
        return (
          pesoA -
          pesoB
        );
      }

      return a.cor.localeCompare(
        b.cor,
        "pt-BR"
      );
    }
  );

  const nome =
    text(
      product.nome
    );

  const imagens =
    extractImages(
      product
    );

  return {
    ...group,

    nome:
      baseName(
        nome
      ) ||
      nome ||
      group.nome,

    descricao:
      text(
        product
          .descricao_complementar
      ) ||
      text(
        product.obs
      ) ||
      group.descricao,

    preco:
      toNumber(
        product.preco
      ) ||
      group.preco,

    precoPromocional:
      optionalNumber(
        product
          .preco_promocional
      ) ??
      group.precoPromocional,

    imagens:
      imagens.length > 0
        ? imagens
        : group.imagens,

    variations:
      normalized,
  };
}

/* =========================================================
 * ESTOQUE REAL
 * =======================================================*/

async function getStock(
  id: string,
  limiter?: TinyRequestLimiter
): Promise<StockResult> {
  const response =
    await tinyPost<
      TinyResponse
    >(
      "produto.obter.estoque.php",
      {
        id,
      },
      limiter
    );

  const retorno =
    response.data
      .retorno;

  if (
    !retorno ||
    retorno.status !==
      "OK" ||
    !retorno.produto
  ) {
    throw new Error(
      tinyErrorMessage(
        response.data
      )
    );
  }

  const produto =
    retorno.produto;

  /*
   * Saldo principal.
   */
  const saldo =
    optionalNumber(
      produto.saldo
    );

  if (
    saldo !==
    undefined
  ) {
    return {
      id,

      saldo,
    };
  }

  /*
   * Fallback por depósitos.
   */
  let total =
    0;

  for (
    const item of
    produto.depositos ??
    []
  ) {
    const deposito =
      item?.deposito;

    if (
      !deposito
    ) {
      continue;
    }

    if (
      normalize(
        text(
          deposito.desconsiderar
        )
      ) === "s"
    ) {
      continue;
    }

    total +=
      toNumber(
        deposito.saldo
      );
  }

  return {
    id,

    saldo:
      total,
  };
}

/* =========================================================
 * AGREGA ESTOQUE
 * =======================================================*/

function aggregateStock(
  values: Array<{
    tamanho: string;
    cor: string;
    saldo: number;
  }>
) {
  const porTamanho =
    new Map<
      string,
      number
    >();

  const porCor =
    new Map<
      string,
      number
    >();

  let estoque =
    0;

  for (
    const item of
    values
  ) {
    estoque +=
      item.saldo;

    if (
      item.tamanho
    ) {
      porTamanho.set(
        item.tamanho,
        (
          porTamanho.get(
            item.tamanho
          ) ?? 0
        ) +
          item.saldo
      );
    }

    if (
      item.cor
    ) {
      porCor.set(
        item.cor,
        (
          porCor.get(
            item.cor
          ) ?? 0
        ) +
          item.saldo
      );
    }
  }

  const tamanhos =
    ordenarTamanhos(
      [
        ...porTamanho.keys(),
      ]
    );

  const cores =
    [
      ...porCor.keys(),
    ].sort(
      (a, b) =>
        a.localeCompare(
          b,
          "pt-BR"
        )
    );

  return {
    estoque:
      Math.round(
        estoque
      ),

    tamanhos,

    cores,

    estoquePorTamanho:
      Object.fromEntries(
        tamanhos.map(
          (tamanho) => [
            tamanho,
            porTamanho.get(
              tamanho
            ) ?? 0,
          ]
        )
      ),

    estoquePorCor:
      Object.fromEntries(
        cores.map(
          (cor) => [
            cor,
            porCor.get(
              cor
            ) ?? 0,
          ]
        )
      ),
  };
}

/* =========================================================
 * SINCRONIZAÇÃO V2 — UMA ÚNICA REQUISIÇÃO
 * =======================================================*/

async function searchAllProductsFast(
  limiter: TinyRequestLimiter
): Promise<{
  products: TinyProduct[];
  apiLimit: number;
  paginas: number;
}> {
  const products: TinyProduct[] = [];

  const adicionarProdutos = (data: TinyResponse) => {
    for (const item of data.retorno?.produtos ?? []) {
      const product = item?.produto;

      if (!product?.id) continue;

      if (normalize(text(product.situacao)) === "e") continue;

      products.push(product);
    }
  };

  const primeira = await tinyPost<TinyResponse>(
    "produtos.pesquisa.php",
    {
      pesquisa: "",
      pagina: 1,
    },
    limiter
  );

  const primeiroRetorno = primeira.data.retorno;

  if (!primeiroRetorno || primeiroRetorno.status !== "OK") {
    throw new Error(tinyErrorMessage(primeira.data));
  }

  adicionarProdutos(primeira.data);

  const totalPages = Math.min(
    MAX_SEARCH_PAGES,
    toNumber(primeiroRetorno.numero_paginas) || 1
  );

  const paginasRestantes = Array.from(
    { length: Math.max(0, totalPages - 1) },
    (_, index) => index + 2
  );

  const respostas = await Promise.all(
    paginasRestantes.map((pagina) =>
      tinyPost<TinyResponse>(
        "produtos.pesquisa.php",
        {
          pesquisa: "",
          pagina,
        },
        limiter
      )
    )
  );

  for (const resposta of respostas) {
    const retorno = resposta.data.retorno;

    if (!retorno || retorno.status !== "OK") {
      throw new Error(tinyErrorMessage(resposta.data));
    }

    adicionarProdutos(resposta.data);
  }

  return {
    products: deduplicarProdutos(products),
    apiLimit: limiter.getLimit(),
    paginas: totalPages,
  };
}

function findExistingProductMaps(
  products: Array<{ id: string; nome: string }>
) {
  const byId = new Map<string, { id: string; nome: string }>();
  const byName = new Map<string, { id: string; nome: string }>();

  for (const product of products) {
    if (product.id) byId.set(String(product.id), product);

    const name = normalize(product.nome);
    if (name && !byName.has(name)) {
      byName.set(name, product);
    }
  }

  return { byId, byName };
}

async function syncAllProductsFast(): Promise<{
  criados: number;
  atualizados: number;
  ignorados: number;
  variacoesProcessadas: number;
  paginas: number;
  apiLimit: number;
  duracaoMs: number;
}> {
  const startedAt = Date.now();
  const limiter = new TinyRequestLimiter();

  const catalogo = await searchAllProductsFast(limiter);
  const startResult = buildStartGroups(catalogo.products);
  const groups = [...startResult.groups];

  /*
   * Só buscamos detalhes para P que realmente não receberam
   * variações na pesquisa do catálogo.
   */
  const groupsComDetalhes = await Promise.all(
    groups.map(async (group) => {
      if (
        group.tipoVariacao !== "P" ||
        group.variations.length > 0
      ) {
        return group;
      }

      const product = await getProductDetails(
        group.id,
        limiter
      );

      return buildDetailedGroup(group, product);
    })
  );

  /*
   * Cada variação é consultada uma única vez.
   * O limitador é global, então não existe mais o problema
   * de 5 requests do frontend dispararem outros 5 dentro da API.
   *
   * Quando o Tiny já retornou estoque_atual na pesquisa/detalhes,
   * aproveitamos esse valor e não fazemos chamada extra.
   */
  const variationMap = new Map<
    string,
    { variation: StartVariation; groupIndexes: number[] }
  >();

  groupsComDetalhes.forEach((group, groupIndex) => {
    for (const variation of group.variations) {
      const id = text(variation.id);
      if (!id) continue;

      const current = variationMap.get(id);
      if (current) {
        if (!current.groupIndexes.includes(groupIndex)) {
          current.groupIndexes.push(groupIndex);
        }
      } else {
        variationMap.set(id, {
          variation,
          groupIndexes: [groupIndex],
        });
      }
    }
  });

  const variationEntries = [...variationMap.values()];
  const stocksById = new Map<string, number>();

  const precisamConsulta = variationEntries.filter(
    ({ variation }) =>
      !Number.isFinite(variation.saldoInicial)
  );

  for (const { variation } of variationEntries) {
    if (Number.isFinite(variation.saldoInicial)) {
      stocksById.set(
        text(variation.id),
        Math.max(0, toNumber(variation.saldoInicial))
      );
    }
  }

  const STOCK_CHUNK = 100;

  for (let inicio = 0; inicio < precisamConsulta.length; inicio += STOCK_CHUNK) {
    const lote = precisamConsulta.slice(
      inicio,
      inicio + STOCK_CHUNK
    );

    const stocks = await Promise.all(
      lote.map(({ variation }) =>
        getStock(text(variation.id), limiter)
      )
    );

    for (const stock of stocks) {
      stocksById.set(
        text(stock.id),
        Math.max(0, toNumber(stock.saldo))
      );
    }
  }

  const stocksPorGrupo = new Map<
    number,
    Array<{ id: string; saldo: number }>
  >();

  variationMap.forEach(({ variation, groupIndexes }) => {
    const id = text(variation.id);
    if (!id) return;

    const saldo = Math.max(0, toNumber(stocksById.get(id)));

    for (const groupIndex of groupIndexes) {
      const list = stocksPorGrupo.get(groupIndex) ?? [];
      list.push({ id, saldo });
      stocksPorGrupo.set(groupIndex, list);
    }
  });

  /*
   * Uma única leitura do banco para descobrir o que já existe.
   * Isso evita dezenas/centenas de findUnique/findFirst individuais.
   */
  const existentes = await prisma.produto.findMany({
    select: {
      id: true,
      nome: true,
    },
  });

  const existingMaps = findExistingProductMaps(existentes);

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  const operations: Array<ReturnType<typeof prisma.produto.update> | ReturnType<typeof prisma.produto.create>> = [];
  const operationStatuses: Array<"created" | "updated"> = [];

  for (let index = 0; index < groupsComDetalhes.length; index += 1) {
    const group = groupsComDetalhes[index];
    const stocks = stocksPorGrupo.get(index) ?? [];
    const aggregate = aggregateStock(
      stocks.map((item) => {
        const variation = group.variations.find(
          (v) => text(v.id) === text(item.id)
        );

        return {
          id: item.id,
          saldo: item.saldo,
          tamanho: variation?.tamanho ?? "",
          cor: variation?.cor ?? "",
        };
      })
    );

    const existing =
      existingMaps.byId.get(group.id) ??
      existingMaps.byName.get(normalize(group.nome));

    if (existing) {
      operations.push(
        prisma.produto.update({
          where: { id: existing.id },
          data: {
            // IMPORTANTE: só estoque/variações.
            // Categoria, faixa etária, preço, descrição e imagens manuais
            // do produto existente permanecem intactos.
            estoque: aggregate.estoque,
            tamanhos: aggregate.tamanhos,
            estoquePorTamanho: aggregate.estoquePorTamanho,
            cores: aggregate.cores,
            estoquePorCor: aggregate.estoquePorCor,
          },
        })
      );
      operationStatuses.push("updated");
    } else {
      const imagens = [...new Set((group.imagens ?? []).filter(Boolean))];
      const imageUrl = imagens[0] ?? PLACEHOLDER_IMAGE;
      const imageData = imagens.length > 0 ? imagens : [PLACEHOLDER_IMAGE];

      operations.push(
        prisma.produto.create({
          data: {
            id: group.id,
            nome: group.nome,
            descricao: group.descricao,
            preco: group.preco,
            precoPromocional: group.precoPromocional,
            estoque: aggregate.estoque,
            tamanhos: aggregate.tamanhos,
            estoquePorTamanho: aggregate.estoquePorTamanho,
            cores: aggregate.cores,
            estoquePorCor: aggregate.estoquePorCor,
            imagemUrl: imageUrl,
            imagens: imageData,
            ativo: true,
          },
        })
      );
      operationStatuses.push("created");
    }
  }

  /*
   * Prisma executa o lote em uma transação. Se algum produto falhar,
   * a gravação do lote é abortada em vez de deixar a sincronização
   * pela metade.
   */
  if (operations.length > 0) {
    await prisma.$transaction(operations as any);

    for (const status of operationStatuses) {
      if (status === "created") criados += 1;
      if (status === "updated") atualizados += 1;
    }
  } else {
    ignorados = 0;
  }

  return {
    criados,
    atualizados,
    ignorados,
    variacoesProcessadas: variationEntries.length,
    paginas: catalogo.paginas,
    apiLimit: limiter.getLimit(),
    duracaoMs: Date.now() - startedAt,
  };
}

/* =========================================================
 * SINCRONIZAÇÃO INCREMENTAL RÁPIDA
 *
 * Em vez de percorrer todo o catálogo e consultar o estoque de cada
 * variação, usamos as filas de atualização do Tiny. A fila de estoque
 * já entrega o saldo atual; portanto, na operação normal fazemos poucas
 * chamadas ao Tiny independentemente da quantidade total de produtos.
 *
 * O Tiny informa que esses dois serviços exigem a extensão "API para
 * estoque em tempo real" e que os registros obtidos são removidos da
 * fila e marcados como processados.
 * =======================================================*/

/*
 * A API de filas do Tiny aceita somente registros dentro dos
 * últimos 30 dias. Nunca usamos uma data fixa antiga aqui.
 * Usamos uma janela ligeiramente menor que 30 dias para evitar
 * problemas de borda de horário/fuso.
 */
const TINY_SYNC_LOOKBACK_HOURS = 29 * 24 + 23;
const MAX_UPDATE_QUEUE_PAGES = 10;

function formatTinyDateAlteracao(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function getTinySyncDataAlteracao(): string {
  return formatTinyDateAlteracao(
    new Date(Date.now() - TINY_SYNC_LOOKBACK_HOURS * 60 * 60 * 1000)
  );
}

interface TinyQueueReturn<T> {
  retorno?: {
    status?: string;
    mensagem?: string;
    pagina?: string | number;
    numero_paginas?: string | number;
    erros?: Array<{
      erro?: string;
      descricao?: string;
    }>;
    produtos?: Array<{
      produto?: T;
    }>;
  };
}

function tipoVariacaoTiny(product: {
  tipoVariacao?: unknown;
  tipo_variacao?: unknown;
}): string {
  return (
    text(product.tipoVariacao) ||
    text(product.tipo_variacao)
  ).toUpperCase();
}

function saldoDoEstoqueAtualizado(
  product: TinyUpdatedStockProduct
): number {
  return Math.max(0, toNumber(product.saldo));
}

function isRealtimeQueueUnavailable(message: string): boolean {
  const n = normalize(message);
  return (
    n.includes("api para estoque em tempo real") ||
    n.includes("estoque em tempo real") ||
    n.includes("extensao") && n.includes("estoque") ||
    n.includes("modulo") && n.includes("estoque em tempo real") ||
    n.includes("servico nao disponivel") ||
    n.includes("metodo nao disponivel")
  );
}

async function readTinyUpdateQueue<T>(
  endpoint: string,
  dataAlteracao: string
): Promise<{
  products: T[];
  paginasTotal: number;
  paginasProcessadas: number;
  temMais: boolean;
}> {
  const output: T[] = [];
  let paginasProcessadas = 0;
  let ultimaPaginaCheia = false;

  /*
   * Os registros da fila são removidos/marcados como processados
   * quando obtidos. Portanto, para consumir a fila corretamente,
   * repetimos a PAGINA 1. Não avançamos para a página 2 enquanto
   * os próprios registros estão saindo da fila.
   */
  for (
    let tentativa = 0;
    tentativa < MAX_UPDATE_QUEUE_PAGES;
    tentativa += 1
  ) {
    const response = await tinyPost<TinyQueueReturn<T>>(
      endpoint,
      {
        dataAlteracao,
        pagina: 1,
      },
      undefined,
      { allowEmptyQueue: true }
    );

    paginasProcessadas += 1;

    if (isTinyEmptyQueueError(response.data as TinyResponse)) {
      ultimaPaginaCheia = false;
      break;
    }

    const retorno = response.data.retorno;
    const items = (retorno?.produtos ?? [])
      .map((item) => item?.produto)
      .filter(Boolean) as T[];

    output.push(...items);

    ultimaPaginaCheia = items.length >= 100;

    if (items.length < 100) {
      break;
    }
  }

  return {
    products: output,
    paginasTotal: paginasProcessadas,
    paginasProcessadas,
    temMais: ultimaPaginaCheia,
  };
}

function cloneJsonObject(
  value: unknown
): Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, any>;
}

function applyVariationStockUpdate(
  current: {
    estoque: number;
    tamanhos: string[];
    cores: string[];
    estoquePorTamanho: Record<string, any>;
    estoquePorCor: Record<string, any>;
  },
  update: TinyUpdatedStockProduct
): {
  next: typeof current;
  changed: boolean;
} {
  const nome = text(update.nome);

  let grade = gradeFromTiny((update as any).grade);
  if ((!grade.tamanho || !grade.cor) && nome) {
    const byName = gradeFromName(nome);
    if (!grade.tamanho) grade.tamanho = byName.tamanho;
    if (!grade.cor) grade.cor = byName.cor;
  }

  const saldoNovo = saldoDoEstoqueAtualizado(update);

  const next = {
    estoque: Math.max(0, Number(current.estoque) || 0),
    tamanhos: [...(current.tamanhos ?? [])],
    cores: [...(current.cores ?? [])],
    estoquePorTamanho: cloneJsonObject(current.estoquePorTamanho),
    estoquePorCor: cloneJsonObject(current.estoquePorCor),
  };

  if (!grade.tamanho || !grade.cor) {
    return { next, changed: false };
  }

  if (!next.tamanhos.includes(grade.tamanho)) {
    next.tamanhos.push(grade.tamanho);
    next.tamanhos = ordenarTamanhos(next.tamanhos);
  }

  if (!next.cores.includes(grade.cor)) {
    next.cores.push(grade.cor);
    next.cores.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  const corAtual = next.estoquePorCor[grade.cor];
  const temMatriz =
    Boolean(corAtual) &&
    typeof corAtual === "object" &&
    !Array.isArray(corAtual);

  if (!temMatriz) {
    return { next, changed: false };
  }

  const linha = cloneJsonObject(corAtual);
  const estoqueAnterior = Math.max(
    0,
    toNumber(linha[grade.tamanho])
  );
  const delta = saldoNovo - estoqueAnterior;

  linha[grade.tamanho] = saldoNovo;
  next.estoquePorCor[grade.cor] = linha;

  const tamanhoAtual = toNumber(
    next.estoquePorTamanho[grade.tamanho]
  );
  next.estoquePorTamanho[grade.tamanho] = Math.max(
    0,
    tamanhoAtual + delta
  );

  next.estoque = Math.max(0, next.estoque + delta);

  return {
    next,
    changed: true,
  };
}

function buildNewProductFromQueues(
  product: TinyUpdatedProduct,
  stockById: Map<string, TinyUpdatedStockProduct>,
  groupedProducts: TinyUpdatedProduct[]
) {
  const tipo = tipoVariacaoTiny(product);
  const group = groupedProducts.find(
    (item) => tipoVariacaoTiny(item) === "P"
  );

  const baseProduct = group ?? product;
  const parentName =
    baseName(text(baseProduct.nome)) ||
    text(baseProduct.nome) ||
    `Produto ${text(baseProduct.id)}`;

  const productId =
    text(baseProduct.id) ||
    text(product.idProdutoPai) ||
    text(product.id_produto_pai) ||
    text(product.id);

  const variations = groupedProducts.filter(
    (item) => tipoVariacaoTiny(item) === "V"
  );

  const values: Array<{
    tamanho: string;
    cor: string;
    saldo: number;
  }> = [];

  for (const variation of variations) {
    const stock = stockById.get(text(variation.id));
    const nomeVariacao = text(variation.nome);
    let grade = gradeFromTiny((variation as any).grade);

    if ((!grade.tamanho || !grade.cor) && nomeVariacao) {
      const parsed = gradeFromName(nomeVariacao);
      if (!grade.tamanho) grade.tamanho = parsed.tamanho;
      if (!grade.cor) grade.cor = parsed.cor;
    }

    if (!grade.tamanho && !grade.cor) continue;

    values.push({
      tamanho: grade.tamanho,
      cor: grade.cor,
      saldo: stock ? saldoDoEstoqueAtualizado(stock) : 0,
    });
  }

  const aggregate = aggregateStock(values);
  const ownStock = stockById.get(text(baseProduct.id));
  const stockTotal = ownStock
    ? saldoDoEstoqueAtualizado(ownStock)
    : aggregate.estoque;

  return {
    id: productId,
    nome: parentName,
    descricao:
      text(baseProduct.descricao_complementar) ||
      text(baseProduct.obs) ||
      parentName,
    preco: toNumber(baseProduct.preco),
    precoPromocional:
      optionalNumber(baseProduct.preco_promocional) ?? null,
    estoque: stockTotal,
    tamanhos: aggregate.tamanhos,
    estoquePorTamanho: aggregate.estoquePorTamanho,
    cores: aggregate.cores,
    estoquePorCor: aggregate.estoquePorCor,
    imagemUrl: PLACEHOLDER_IMAGE,
    imagens: [PLACEHOLDER_IMAGE],
  };
}

async function syncIncrementalFast(): Promise<{
  criados: number;
  atualizados: number;
  ignorados: number;
  variacoesProcessadas: number;
  produtosAlteradosProcessados: number;
  paginasEstoque: number;
  paginasProdutos: number;
  temMaisEstoque: boolean;
  temMaisProdutos: boolean;
  duracaoMs: number;
  dataCorte: string;
}> {
  const startedAt = Date.now();

  const dataCorte = getTinySyncDataAlteracao();

  let estoqueQueue: Awaited<
    ReturnType<typeof readTinyUpdateQueue<TinyUpdatedStockProduct>>
  >;
  let produtosQueue: Awaited<
    ReturnType<typeof readTinyUpdateQueue<TinyUpdatedProduct>>
  >;

  try {
    estoqueQueue = await readTinyUpdateQueue<TinyUpdatedStockProduct>(
      "lista.atualizacoes.estoque",
      dataCorte
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRealtimeQueueUnavailable(message)) {
      throw new Error(
        "A sincronização rápida exige a extensão 'API para estoque em tempo real' no Tiny. Instale essa extensão no Tiny e tente novamente."
      );
    }
    if (normalize(message).includes("ultimos 30 dias")) {
      throw new Error(
        "O Tiny recusou a data da fila. O sistema já calcula automaticamente uma janela de menos de 30 dias; confira a data/hora do servidor."
      );
    }
    throw error;
  }

  try {
    produtosQueue = await readTinyUpdateQueue<TinyUpdatedProduct>(
      "lista.atualizacoes.produtos",
      dataCorte
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRealtimeQueueUnavailable(message)) {
      throw new Error(
        "A sincronização rápida de novos produtos exige a extensão 'API para estoque em tempo real' no Tiny. Instale essa extensão no Tiny e tente novamente."
      );
    }
    throw error;
  }

  const stockById = new Map<string, TinyUpdatedStockProduct>();
  for (const item of estoqueQueue.products) {
    const id = text(item.id);
    if (id) stockById.set(id, item);
  }

  const existentes = await prisma.produto.findMany({
    select: {
      id: true,
      nome: true,
      estoque: true,
      tamanhos: true,
      cores: true,
      estoquePorTamanho: true,
      estoquePorCor: true,
    },
  });

  const byId = new Map<string, (typeof existentes)[number]>();
  const byName = new Map<string, (typeof existentes)[number]>();

  for (const product of existentes) {
    byId.set(String(product.id), product);
    const name = normalize(String(product.nome ?? ""));
    if (name && !byName.has(name)) byName.set(name, product);
  }

  /* =====================================================
   * PRODUTOS NOVOS
   * ===================================================*/
  const novosGrupos = new Map<string, TinyUpdatedProduct[]>();

  for (const product of produtosQueue.products) {
    const id = text(product.id);
    const nome = text(product.nome);
    if (!id || !nome) continue;

    const tipo = tipoVariacaoTiny(product);
    const parentId =
      text(product.idProdutoPai) ||
      text(product.id_produto_pai);

    const chave =
      tipo === "V"
        ? parentId || normalize(baseName(nome))
        : id;

    const grupo = novosGrupos.get(chave) ?? [];
    grupo.push(product);
    novosGrupos.set(chave, grupo);
  }

  const novos = [] as ReturnType<typeof buildNewProductFromQueues>[];

  for (const grupo of novosGrupos.values()) {
    const base =
      grupo.find((item) => {
        const tipo = tipoVariacaoTiny(item);
        return tipo === "P" || tipo === "N";
      }) ?? grupo[0];

    if (!base) continue;

    const tipo = tipoVariacaoTiny(base);
    const parentId =
      text(base.idProdutoPai) ||
      text(base.id_produto_pai);

    const id =
      tipo === "V" && !parentId
        ? ""
        : text(base.id);

    if (!id) continue;

    const byTinyId = byId.get(id);
    const byExactName = byName.get(normalize(text(base.nome)));
    const byBaseName = byName.get(
      normalize(baseName(text(base.nome)))
    );

    if (byTinyId || byExactName || byBaseName) continue;

    novos.push(
      buildNewProductFromQueues(
        base,
        stockById,
        grupo
      )
    );
  }

  /* =====================================================
   * ESTOQUE EXISTENTE
   * ===================================================*/
  const pending = new Map<
    string,
    {
      estoque: number;
      tamanhos: string[];
      cores: string[];
      estoquePorTamanho: Record<string, any>;
      estoquePorCor: Record<string, any>;
      forceTotal?: number;
      matrixChanged: boolean;
    }
  >();

  const getPending = (existing: (typeof existentes)[number]) => {
    const current = pending.get(existing.id);
    if (current) return current;

    const created = {
      estoque: Math.max(0, toNumber(existing.estoque)),
      tamanhos: Array.isArray(existing.tamanhos)
        ? [...existing.tamanhos]
        : [],
      cores: Array.isArray(existing.cores)
        ? [...existing.cores]
        : [],
      estoquePorTamanho: cloneJsonObject(existing.estoquePorTamanho),
      estoquePorCor: cloneJsonObject(existing.estoquePorCor),
      forceTotal: undefined as number | undefined,
      matrixChanged: false,
    };

    pending.set(existing.id, created);
    return created;
  };

  /* Totais de normais/pais. */
  for (const item of stockById.values()) {
    const tipo = tipoVariacaoTiny(item);
    if (tipo !== "N" && tipo !== "P") continue;

    const id = text(item.id);
    const nome = text(item.nome);

    const existing =
      byId.get(id) ||
      byName.get(normalize(baseName(nome) || nome));

    if (!existing) continue;

    const target = getPending(existing);
    target.forceTotal = saldoDoEstoqueAtualizado(item);
    target.estoque = target.forceTotal;
  }

  /* Células das variações. */
  for (const item of stockById.values()) {
    if (tipoVariacaoTiny(item) !== "V") continue;

    const nome = text(item.nome);
    const parentId =
      text(item.idProdutoPai) ||
      text(item.id_produto_pai);
    const base = baseName(nome);

    const existing =
      (parentId ? byId.get(parentId) : undefined) ||
      byName.get(normalize(base)) ||
      byName.get(normalize(nome));

    if (!existing) continue;

    const target = getPending(existing);
    const result = applyVariationStockUpdate(
      {
        estoque: target.estoque,
        tamanhos: target.tamanhos,
        cores: target.cores,
        estoquePorTamanho: target.estoquePorTamanho,
        estoquePorCor: target.estoquePorCor,
      },
      item
    );

    if (!result.changed) continue;

    target.estoque = result.next.estoque;
    target.tamanhos = result.next.tamanhos;
    target.cores = result.next.cores;
    target.estoquePorTamanho = result.next.estoquePorTamanho;
    target.estoquePorCor = result.next.estoquePorCor;
    target.matrixChanged = true;
  }

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of novos) {
      const id = item.id;
      if (!id || !item.nome) continue;

      const exists = await tx.produto.findFirst({
        where: {
          OR: [
            { id },
            { nome: item.nome },
          ],
        },
        select: { id: true },
      });

      if (exists) {
        ignorados += 1;
        continue;
      }

      await tx.produto.create({
        data: {
          id: item.id,
          nome: item.nome,
          descricao: item.descricao,
          preco: item.preco,
          precoPromocional: item.precoPromocional,
          estoque: item.estoque,
          tamanhos: item.tamanhos,
          estoquePorTamanho: item.estoquePorTamanho,
          cores: item.cores,
          estoquePorCor: item.estoquePorCor,
          imagemUrl: item.imagemUrl,
          imagens: item.imagens,
          ativo: true,
        },
      });

      criados += 1;
    }

    for (const [id, item] of pending.entries()) {
      await tx.produto.update({
        where: { id },
        data: {
          /*
           * Se o Tiny enviou o registro P, ele é a fonte oficial do total.
           * A matriz continua sendo atualizada pelas variações V.
           */
          estoque:
            item.forceTotal !== undefined
              ? item.forceTotal
              : item.estoque,
          ...(item.matrixChanged
            ? {
                tamanhos: item.tamanhos,
                estoquePorTamanho: item.estoquePorTamanho,
                cores: item.cores,
                estoquePorCor: item.estoquePorCor,
              }
            : {}),
        },
      });

      atualizados += 1;
    }
  });

  return {
    criados,
    atualizados,
    ignorados,
    variacoesProcessadas: stockById.size,
    produtosAlteradosProcessados: produtosQueue.products.length,
    paginasEstoque: estoqueQueue.paginasProcessadas,
    paginasProdutos: produtosQueue.paginasProcessadas,
    temMaisEstoque: estoqueQueue.temMais,
    temMaisProdutos: produtosQueue.temMais,
    duracaoMs: Date.now() - startedAt,
    dataCorte,
  };
}

/* =========================================================
 * POST
 * =======================================================*/

export async function POST(
  req: Request
) {
  try {
    const body =
      await req
        .json()
        .catch(
          () => ({})
        );

    const action =
      body?.action as
        | Action
        | undefined;

    const tipo: SyncType =
      body?.tipo ===
        "estoque" ||
      body?.tipo ===
        "novos_produtos" ||
      body?.tipo ===
        "geral"
        ? body.tipo
        : "geral";

    const token =
      process.env
        .TINY_API_TOKEN
        ?.trim();

    if (!token) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Variável TINY_API_TOKEN não encontrada.",
        },
        {
          status:
            500,
        }
      );
    }

    /* =====================================================
     * SYNC V2
     * ===================================================*/

    if (action === "sync") {
      const result = await syncIncrementalFast();

      return NextResponse.json({
        success: true,
        action: "sync",
        tipo,
        ...result,
      });
    }

    /* =====================================================
     * START
     * ===================================================*/

    if (
      action ===
      "start"
    ) {
      const startedAt =
        Date.now();

      const {
        products,
        apiLimit,
        paginas,
      } =
        await searchAllProducts();

      const result =
        buildStartGroups(
          products
        );

      return NextResponse.json(
        {
          success:
            true,

          action:
            "start",

          tipo,

          apiLimit,

          groups:
            result.groups,

          estatisticas: {
            registrosRecebidos:
              products.length,

            produtosNormais:
              result.normais,

            produtosPais:
              result.pais,

            variacoes:
              result.variacoes,

            variacoesAgrupadas:
              0,

            variacoesOrfas:
              0,

            grupos:
              result.groups.length,

            paginas,

            duracaoMs:
              Date.now() -
              startedAt,
          },
        }
      );
    }

    /* =====================================================
     * DETAILS
     *
     * Um P por chamada.
     * ===================================================*/

    if (
      action ===
      "details"
    ) {
      const group =
        body?.group as
          | StartGroup
          | undefined;

      if (
        !group?.id
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "Produto pai inválido.",
          },
          {
            status:
              400,
          }
        );
      }

      /*
       * Produto N não precisa
       * consultar detalhes.
       */
      if (
        group.tipoVariacao ===
        "N"
      ) {
        return NextResponse.json(
          {
            success:
              true,

            action:
              "details",

            group,

            estatisticas: {
              idPai:
                group.id,

              variacoesEncontradas:
                group.variations
                  .length,

              imagens:
                group.imagens
                  .length,
            },
          }
        );
      }

      const startedAt =
        Date.now();

      /*
       * Busca o pai no Tiny.
       *
       * É aqui que recuperamos
       * as variações reais.
       */
      const product =
        await getProductDetails(
          group.id
        );

      const detailedGroup =
        buildDetailedGroup(
          group,
          product
        );

      return NextResponse.json(
        {
          success:
            true,

          action:
            "details",

          group:
            detailedGroup,

          estatisticas: {
            idPai:
              group.id,

            variacoesEncontradas:
              detailedGroup
                .variations
                .length,

            imagens:
              detailedGroup
                .imagens
                .length,

            duracaoMs:
              Date.now() -
              startedAt,
          },
        }
      );
    }

    /* =====================================================
     * STOCK
     * ===================================================*/

    if (
      action ===
      "stock"
    ) {
      const variations =
        Array.isArray(
          body?.variations
        )
          ? body.variations
          : [];

      const offset =
        Math.max(
          0,
          Number(body?.offset) || 0
        );

      const requested =
        Math.max(
          1,
          Number(body?.batchSize) ||
            MAX_STOCK_BATCH
        );

      const batchSize =
        Math.min(
          MAX_STOCK_BATCH,
          requested
        );

      const batch =
        variations.slice(
          offset,
          offset + batchSize
        ) as StartVariation[];

      if (batch.length === 0) {
        return NextResponse.json({
          success: true,
          action: "stock",
          stocks: [],
          nextOffset: offset,
          done: true,
          waitMs: 0,
        });
      }

      const startedAt =
        Date.now();

      /*
       * As consultas de estoque são independentes.
       * O frontend já calcula o lote respeitando 1/4
       * do limite da conta, portanto podemos executar
       * as chamadas simultaneamente aqui.
       */
      const results =
        await Promise.all(
          batch.map(
            async (variation) => {
              const id =
                text(variation.id);

              if (!id) {
                return null;
              }

              return getStock(id);
            }
          )
        );

      const stocks =
        results.filter(
          (value): value is StockResult =>
            Boolean(value)
        );

      const elapsedMs =
        Date.now() - startedAt;

      /*
       * Não colocamos mais 2 s entre cada SKU.
       * A espera agora considera somente a quantidade
       * de chamadas realizadas e o limite real da conta.
       */
      let apiLimit =
        DEFAULT_LIMIT_PER_MINUTE;

      /*
       * O limite é retornado nos headers de cada chamada.
       * Como getStock já extrai o saldo, o melhor
       * ponto para limitar aqui é o valor informado pelo
       * frontend via apiLimit. Se não vier, usamos 20.
       */
      const providedApiLimit =
        Number(body?.apiLimit);

      if (
        Number.isFinite(providedApiLimit) &&
        providedApiLimit > 0
      ) {
        apiLimit = providedApiLimit;
      }

      const waitMs =
        waitForRateLimit(
          stocks.length,
          apiLimit,
          elapsedMs
        );

      return NextResponse.json({
        success: true,
        action: "stock",
        stocks,
        nextOffset:
          offset + batch.length,
        done:
          offset + batch.length >=
          variations.length,
        waitMs,
        duracaoMs: elapsedMs,
        apiLimit,
      });
    }

    /* =====================================================
     * FINISH
     * ===================================================*/

    if (
      action ===
      "finish"
    ) {
      const group =
        body?.group as
          | StartGroup
          | undefined;

      const rawStocks =
        Array.isArray(
          body?.stocks
        )
          ? body.stocks
          : [];

      if (
        !group?.id ||
        !group?.nome
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "Grupo de produto inválido para finalização.",
          },
          {
            status:
              400,
          }
        );
      }

      /*
       * Relaciona o estoque
       * ao tamanho e à cor.
       */
      const stocks =
        rawStocks.map(
          (
            item: {
              id?: unknown;
              saldo?: unknown;
            }
          ) => {
            const variation =
              group.variations
                .find(
                  (v) =>
                    text(
                      v.id
                    ) ===
                    text(
                      item.id
                    )
                );

            return {
              id:
                text(
                  item.id
                ),

              saldo:
                toNumber(
                  item.saldo
                ),

              tamanho:
                variation
                  ?.tamanho ??
                "",

              cor:
                variation
                  ?.cor ??
                "",
            };
          }
        );

      const aggregate =
        aggregateStock(
          stocks
        );

      const imagens =
        [
          ...new Set(
            (
              group.imagens ??
              []
            ).filter(Boolean)
          ),
        ];

      const imageUrl =
        imagens[0] ??
        PLACEHOLDER_IMAGE;

      const imageData =
        imagens.length > 0
          ? imagens
          : [
              PLACEHOLDER_IMAGE,
            ];

      /*
       * Procuramos primeiro
       * pelo ID atual do produto.
       */
      const existentePorId =
        await prisma.produto.findUnique(
          {
            where: {
              id:
                group.id,
            },
          }
        );

      /*
       * Depois pelo nome.
       */
      const existente =
        existentePorId ??
        (
          await prisma.produto.findFirst(
            {
              where: {
                nome:
                  group.nome,
              },
            }
          )
        );

      /* ===================================================
       * NOVOS PRODUTOS
       * =================================================*/

      if (
        tipo ===
        "novos_produtos"
      ) {
        if (
          existente
        ) {
          /*
           * Mesmo quando o produto já existe,
           * aproveitamos a sincronização para
           * atualizar o vínculo com o Tiny.
           *
           * Isso é importante para produtos
           * antigos que ainda não possuíam
           * tinyVariacoes.
           */
          await prisma.produto.update(
            {
              where: {
                id:
                  existente.id,
              },

              data: {},
            }
          );

          return NextResponse.json(
            {
              success:
                true,

              action:
                "finish",

              status:
                "ignored",

            }
          );
        }

        await prisma.produto.create(
          {
            data: {
              id:
                group.id,

              nome:
                group.nome,

              descricao:
                group.descricao,

              preco:
                group.preco,

              precoPromocional:
                group.precoPromocional,

              estoque:
                aggregate.estoque,

              tamanhos:
                aggregate.tamanhos,

              estoquePorTamanho:
                aggregate.estoquePorTamanho,

              cores:
                aggregate.cores,

              estoquePorCor:
                aggregate.estoquePorCor,

              imagemUrl:
                imageUrl,

              imagens:
                imageData,

              ativo:
                true,

            },
          }
        );

        return NextResponse.json(
          {
            success:
              true,

            action:
              "finish",

            status:
              "created",
          }
        );
      }

      /* ===================================================
       * SOMENTE ESTOQUE
       * =================================================*/

      if (
        tipo ===
        "estoque"
      ) {
        if (
          !existente
        ) {
          return NextResponse.json(
            {
              success:
                true,

              action:
                "finish",

              status:
                "missing",
            }
          );
        }

        await prisma.produto.update(
          {
            where: {
              id:
                existente.id,
            },

            data: {
              estoque:
                aggregate.estoque,

              tamanhos:
                aggregate.tamanhos,

              estoquePorTamanho:
                aggregate.estoquePorTamanho,

              cores:
                aggregate.cores,

              estoquePorCor:
                aggregate.estoquePorCor,

            },
          }
        );

        return NextResponse.json(
          {
            success:
              true,

            action:
              "finish",

            status:
              "updated",
          }
        );
      }

      /* ===================================================
       * GERAL
       *
       * Comportamento atual do botão:
       * - produto já cadastrado: atualiza SOMENTE o estoque
       *   e suas informações de variação vindas do Tiny;
       * - produto inexistente: cadastra automaticamente
       *   o novo produto usando os dados do Tiny.
       *
       * Os dados manuais do produto existente (categoria,
       * faixa etária, preço cadastrado no site, descrição,
       * imagens etc.) não são sobrescritos.
       * =================================================*/

      if (
        existente
      ) {
        await prisma.produto.update(
          {
            where: {
              id:
                existente.id,
            },

            data: {
              estoque:
                aggregate.estoque,

              tamanhos:
                aggregate.tamanhos,

              estoquePorTamanho:
                aggregate.estoquePorTamanho,

              cores:
                aggregate.cores,

              estoquePorCor:
                aggregate.estoquePorCor,
            },
          }
        );

        return NextResponse.json(
          {
            success:
              true,

            action:
              "finish",

            status:
              "updated",
          }
        );
      }

      /*
       * Produto ainda não existe.
       */
      await prisma.produto.create(
        {
          data: {
            id:
              group.id,

            nome:
              group.nome,

            descricao:
              group.descricao,

            preco:
              group.preco,

            precoPromocional:
              group.precoPromocional,

            estoque:
              aggregate.estoque,

            tamanhos:
              aggregate.tamanhos,

            estoquePorTamanho:
              aggregate.estoquePorTamanho,

            cores:
              aggregate.cores,

            estoquePorCor:
              aggregate.estoquePorCor,

            imagemUrl:
              imageUrl,

            imagens:
              imageData,

            ativo:
              true,

          },
        }
      );

      return NextResponse.json(
        {
          success:
            true,

          action:
            "finish",

          status:
            "created",
        }
      );
    }

    /* =====================================================
     * AÇÃO INVÁLIDA
     * ===================================================*/

    return NextResponse.json(
      {
        success:
          false,

        error:
          "Ação de sincronização inválida. Use sync, start, details, stock ou finish.",
      },
      {
        status:
          400,
      }
    );
  } catch (error) {
    console.error(
      "🔥 ERRO NA SINCRONIZAÇÃO TINY:",
      error
    );

    const details =
      error instanceof Error
        ? error.message
        : "Erro desconhecido.";

    const bloqueada =
      normalize(details).includes("api bloqueada") ||
      normalize(details).includes("excedido o numero de acessos");

    return NextResponse.json(
      {
        success: false,
        error: bloqueada
          ? "A API do Tiny está temporariamente bloqueada por excesso de requisições."
          : "Erro interno ao processar sincronização com o Tiny.",
        details,
        blocked: bloqueada,
      },
      {
        status: bloqueada ? 429 : 500,
        headers: bloqueada
          ? { "Retry-After": "180" }
          : undefined,
      }
    );
  }
}
