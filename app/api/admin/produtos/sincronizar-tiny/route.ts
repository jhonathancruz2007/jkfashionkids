import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";

const DEFAULT_LIMIT_PER_MINUTE = 20;
const MAX_SEARCH_PAGES = 1000;
const MAX_STOCK_BATCH = 5;
const PLACEHOLDER_IMAGE = "https://via.placeholder.com/300";

type SyncType = "geral" | "estoque" | "novos_produtos";
type Action = "start" | "stock" | "finish";

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

type TinyStockProduct = TinyProduct & {
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
    status_processamento?: string | number;
    codigo_erro?: string | number;

    erros?: Array<{
      erro?: string;
      descricao?: string;
    }>;

    mensagem?: string;

    pagina?: string | number;
    numero_paginas?: string | number;

    produtos?: Array<{
      produto?: TinyProduct;
    }>;

    produto?: TinyStockProduct;
  };
};

type StartVariation = {
  id: string;
  tamanho: string;
  cor: string;
  estoque_atual?: number;
};

type StartGroup = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  precoPromocional: number | null;
  imagens: string[];
  tipoVariacao: string;
  variations: StartVariation[];
};

type StockResult = {
  id: string;
  saldo: number;
};

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function number(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(
    String(value)
      .replace(/\./g, "")
      .replace(",", ".")
  );

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const fallback = Number(value);

  return Number.isFinite(fallback) ? fallback : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(
    String(value)
      .replace(/\./g, "")
      .replace(",", ".")
  );

  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tinyErrorMessage(
  data: TinyResponse,
  fallback = "O Tiny não retornou os dados solicitados."
): string {
  const errors = (data.retorno?.erros ?? [])
    .map((item) => {
      return (
        text(item?.erro) ||
        text(item?.descricao)
      );
    })
    .filter(Boolean);

  if (errors.length > 0) {
    return errors.join(" | ");
  }

  const mensagem = text(data.retorno?.mensagem);

  if (mensagem) {
    return mensagem;
  }

  return fallback;
}

/**
 * Executa chamada POST na API 2.0 do Tiny.
 *
 * O token fica somente no backend.
 */
async function tinyPost<T>(
  endpoint: string,
  params: Record<string, string | number>,
  retries = 2
): Promise<{
  data: T;
  headers: Headers;
  status: number;
}> {
  const token = process.env.TINY_API_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "Variável TINY_API_TOKEN não encontrada."
    );
  }

  const body = new URLSearchParams();

  body.set("token", token);
  body.set("formato", "json");

  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  const response = await fetch(
    `${TINY_BASE_URL}/${endpoint}`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        Accept: "application/json",
      },

      body: body.toString(),

      cache: "no-store",
    }
  );

  const raw = await response.text();

  let data: T;

  try {
    data = JSON.parse(raw) as T;
  } catch {
    if (
      retries > 0 &&
      (
        response.status === 429 ||
        response.status >= 500
      )
    ) {
      const retryAfterHeader =
        response.headers.get("retry-after");

      const retryAfter = Number(
        retryAfterHeader
      );

      await sleep(
        Number.isFinite(retryAfter) &&
        retryAfter > 0
          ? retryAfter * 1000
          : 2000
      );

      return tinyPost<T>(
        endpoint,
        params,
        retries - 1
      );
    }

    throw new Error(
      `Resposta inválida do Tiny em ${endpoint}. HTTP ${response.status}.`
    );
  }

  const typedData =
    data as T & TinyResponse;

  const tinyMessage =
    tinyErrorMessage(
      typedData,
      `Erro HTTP ${response.status}.`
    );

  /*
   * Rate limit.
   */
  if (
    response.status === 429 ||
    tinyMessage
      .toLowerCase()
      .includes("limite")
  ) {
    if (retries > 0) {
      const retryAfterHeader =
        response.headers.get("retry-after");

      const retryAfter = Number(
        retryAfterHeader
      );

      await sleep(
        Number.isFinite(retryAfter) &&
        retryAfter > 0
          ? retryAfter * 1000
          : 5000
      );

      return tinyPost<T>(
        endpoint,
        params,
        retries - 1
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      `Tiny respondeu HTTP ${response.status} em ${endpoint}: ${tinyMessage}`
    );
  }

  return {
    data,
    headers: response.headers,
    status: response.status,
  };
}

/**
 * Lê o limite de chamadas informado pelo Tiny.
 */
function limitFromHeaders(
  headers: Headers
): number {
  const value = Number(
    headers.get("x-limit-api")
  );

  if (
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }

  return DEFAULT_LIMIT_PER_MINUTE;
}

/**
 * Extrai URLs de imagens do produto.
 */
function extractImages(
  product: TinyProduct
): string[] {
  const urls: string[] = [];

  for (
    const item of product.anexos ?? []
  ) {
    const url = text(item?.anexo);

    if (url) {
      urls.push(url);
    }
  }

  for (
    const item of product.imagens_externas ?? []
  ) {
    const url = text(
      item?.imagem_externa?.url
    );

    if (url) {
      urls.push(url);
    }
  }

  return [...new Set(urls)];
}

/**
 * Fallback para produtos cujo nome tenha:
 *
 * Produto - Tamanho - Cor
 */
function gradeFromName(
  name: string
): {
  tamanho: string;
  cor: string;
} {
  const parts = name
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return {
      tamanho: "",
      cor: "",
    };
  }

  return {
    tamanho:
      parts[parts.length - 2] ?? "",

    cor:
      parts[parts.length - 1] ?? "",
  };
}

/**
 * Lê a grade do Tiny.
 *
 * Aceita:
 *
 * {
 *   Tamanho: "M",
 *   Cor: "Preto"
 * }
 *
 * ou:
 *
 * [
 *   { Tamanho: "M" },
 *   { Cor: "Preto" }
 * ]
 */
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
    const key = normalize(
      text(rawKey)
    );

    const value = text(rawValue);

    if (!key || !value) {
      return;
    }

    if (
      !tamanho &&
      (
        key.includes("tamanho") ||
        key === "tam" ||
        key.includes("size")
      )
    ) {
      tamanho = value;
    }

    if (
      !cor &&
      (
        key.includes("cor") ||
        key.includes("color") ||
        key.includes("colour")
      )
    ) {
      cor = value;
    }
  };

  if (Array.isArray(grade)) {
    for (const item of grade) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        continue;
      }

      for (
        const [key, value]
          of Object.entries(item)
      ) {
        inspect(key, value);
      }
    }
  } else if (
    grade &&
    typeof grade === "object"
  ) {
    for (
      const [key, value]
        of Object.entries(grade)
    ) {
      inspect(key, value);
    }
  }

  return {
    tamanho,
    cor,
  };
}

/**
 * Remove sufixo de variação quando existir.
 */
function baseName(
  name: string
): string {
  const parts = name
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return parts
      .slice(0, -2)
      .join(" - ")
      .trim();
  }

  return name.trim();
}

/**
 * Converte qualquer formato de "variacoes"
 * retornado pelo Tiny para um array normalizado.
 */
function normalizeVariations(
  raw: unknown
): TinyVariation[] {
  if (!raw) {
    return [];
  }

  const result: TinyVariation[] = [];

  const pushCandidate = (
    value: unknown
  ) => {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    if (Array.isArray(value)) {
      return;
    }

    const objectValue =
      value as Record<string, unknown>;

    let candidate: unknown = value;

    if (
      objectValue.variacao &&
      typeof objectValue.variacao ===
        "object"
    ) {
      candidate =
        objectValue.variacao;
    }

    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return;
    }

    const variation =
      candidate as TinyVariation;

    const id = text(variation.id);

    if (!id) {
      return;
    }

    result.push(variation);
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      pushCandidate(item);
    }
  } else if (
    typeof raw === "object"
  ) {
    for (
      const item of Object.values(
        raw as Record<string, unknown>
      )
    ) {
      pushCandidate(item);
    }
  }

  const unique =
    new Map<string, TinyVariation>();

  for (const item of result) {
    unique.set(
      text(item.id),
      item
    );
  }

  return [...unique.values()];
}

/**
 * Pesquisa todo o catálogo do Tiny.
 */
async function searchAllProducts(): Promise<{
  products: TinyProduct[];
  apiLimit: number;
}> {
  const products: TinyProduct[] = [];

  let page = 1;
  let totalPages = 1;
  let apiLimit =
    DEFAULT_LIMIT_PER_MINUTE;

  while (
    page <= totalPages &&
    page <= MAX_SEARCH_PAGES
  ) {
    const response =
      await tinyPost<TinyResponse>(
        "produtos.pesquisa.php",
        {
          pesquisa: "",
          pagina: page,
        }
      );

    apiLimit =
      limitFromHeaders(
        response.headers
      );

    const retorno =
      response.data.retorno;

    if (
      !retorno ||
      retorno.status !== "OK"
    ) {
      throw new Error(
        tinyErrorMessage(
          response.data
        )
      );
    }

    for (
      const item
        of retorno.produtos ?? []
    ) {
      if (item?.produto?.id) {
        products.push(
          item.produto
        );
      }
    }

    totalPages =
      number(
        retorno.numero_paginas
      ) || page;

    page += 1;

    if (page <= totalPages) {
      /*
       * Pequeno intervalo entre páginas.
       */
      await sleep(150);
    }
  }

  return {
    products,
    apiLimit,
  };
}

/**
 * Cria os grupos de produtos.
 *
 * Produto pai:
 * tipoVariacao = P
 *
 * Variação:
 * tipoVariacao = V
 *
 * Produto normal:
 * tipoVariacao = N
 */
function buildGroups(
  products: TinyProduct[]
): StartGroup[] {
  const parents =
    new Map<string, TinyProduct>();

  const parentsByName =
    new Map<string, string>();

  /*
   * Primeiro identificamos os pais.
   */
  for (const product of products) {
    const type =
      text(
        product.tipoVariacao
      ).toUpperCase();

    if (type !== "P") {
      continue;
    }

    const id =
      text(product.id);

    if (!id) {
      continue;
    }

    parents.set(
      id,
      product
    );

    parentsByName.set(
      normalize(
        baseName(
          text(product.nome)
        )
      ),
      id
    );
  }

  const groups =
    new Map<string, StartGroup>();

  const seenVariationIds =
    new Map<
      string,
      Set<string>
    >();

  const ensureGroup = (
    groupId: string,
    representative: TinyProduct
  ) => {
    if (groups.has(groupId)) {
      return;
    }

    const nome =
      baseName(
        text(
          representative.nome
        )
      ) ||
      text(representative.nome) ||
      `Produto ${groupId}`;

    const precoPromocional =
      optionalNumber(
        representative.preco_promocional
      );

    groups.set(
      groupId,
      {
        id: groupId,

        nome,

        descricao:
          text(
            representative.descricao_complementar
          ) ||
          text(
            representative.obs
          ) ||
          nome,

        preco:
          number(
            representative.preco
          ),

        precoPromocional:
          precoPromocional ??
          null,

        imagens:
          extractImages(
            representative
          ),

        tipoVariacao:
          text(
            representative.tipoVariacao
          ),

        variations: [],
      }
    );

    seenVariationIds.set(
      groupId,
      new Set()
    );
  };

  /*
   * Processa os produtos do catálogo.
   */
  for (
    const product of products
  ) {
    const productId =
      text(product.id);

    if (!productId) {
      continue;
    }

    const type =
      text(
        product.tipoVariacao
      ).toUpperCase();

    let groupId =
      text(
        product.idProdutoPai
      );

    /*
     * Produto pai.
     */
    if (
      !groupId &&
      type === "P"
    ) {
      groupId =
        productId;
    }

    /*
     * Caso seja uma variação mas o Tiny
     * não tenha informado idProdutoPai,
     * tentamos pelo nome.
     */
    if (
      !groupId &&
      type === "V"
    ) {
      groupId =
        parentsByName.get(
          normalize(
            baseName(
              text(
                product.nome
              )
            )
          )
        ) || "";
    }

    /*
     * Produto normal sem pai.
     */
    if (!groupId) {
      groupId =
        productId;
    }

    const representative =
      parents.get(groupId) ??
      product;

    ensureGroup(
      groupId,
      representative
    );

    const group =
      groups.get(groupId)!;

    const seen =
      seenVariationIds.get(
        groupId
      )!;

    /*
     * O produto pai não é SKU individual
     * de estoque, então não o adicionamos.
     */
    if (type === "P") {
      continue;
    }

    let grade =
      gradeFromTiny(
        product.grade
      );

    /*
     * Fallback para nomes:
     *
     * Produto - M - Preto
     */
    if (
      !grade.tamanho &&
      !grade.cor
    ) {
      grade =
        gradeFromName(
          text(product.nome)
        );
    }

    if (
      seen.has(productId)
    ) {
      continue;
    }

    seen.add(productId);

    const estoqueAtual =
      optionalNumber(
        product.estoque_atual
      );

    group.variations.push(
      {
        id: productId,

        tamanho:
          grade.tamanho,

        cor:
          grade.cor,

        ...(estoqueAtual !==
          undefined
          ? {
              estoque_atual:
                estoqueAtual,
            }
          : {}),
      }
    );
  }

  return [
    ...groups.values(),
  ];
}

/**
 * Consulta o estoque REAL do Tiny.
 *
 * Primeiro usa:
 *
 * retorno.produto.saldo
 *
 * Se ele não vier,
 * soma os depósitos.
 */
async function getStock(
  id: string
): Promise<StockResult> {
  const response =
    await tinyPost<TinyResponse>(
      "produto.obter.estoque.php",
      {
        id,
      }
    );

  const retorno =
    response.data.retorno;

  if (
    !retorno ||
    retorno.status !== "OK" ||
    !retorno.produto
  ) {
    throw new Error(
      tinyErrorMessage(
        response.data
      )
    );
  }

  const product =
    retorno.produto;

  const saldoDireto =
    optionalNumber(
      product.saldo
    );

  /*
   * O teste isolado confirmou
   * que esse é o campo correto.
   */
  if (
    saldoDireto !== undefined
  ) {
    return {
      id,
      saldo: saldoDireto,
    };
  }

  /*
   * Fallback por depósitos.
   */
  const total =
    (
      product.depositos ?? []
    ).reduce(
      (
        sum,
        item
      ) => {
        const deposito =
          item?.deposito;

        if (!deposito) {
          return sum;
        }

        if (
          normalize(
            text(
              deposito.desconsiderar
            )
          ) === "s"
        ) {
          return sum;
        }

        return (
          sum +
          number(
            deposito.saldo
          )
        );
      },
      0
    );

  return {
    id,
    saldo: total,
  };
}

/**
 * Consolida os estoques:
 *
 * P -> quantidade
 * M -> quantidade
 * G -> quantidade
 *
 * Preto -> quantidade
 * Branco -> quantidade
 */
function sumByKey(
  values: Array<{
    tamanho: string;
    cor: string;
    saldo: number;
  }>
): {
  estoque: number;
  tamanhos: string[];
  cores: string[];
  estoquePorTamanho:
    Record<string, number>;
  estoquePorCor:
    Record<string, number>;
} {
  const porTamanho =
    new Map<string, number>();

  const porCor =
    new Map<string, number>();

  const tamanhos =
    new Set<string>();

  const cores =
    new Set<string>();

  let estoque = 0;

  for (
    const item of values
  ) {
    estoque += item.saldo;

    if (item.tamanho) {
      tamanhos.add(
        item.tamanho
      );

      porTamanho.set(
        item.tamanho,

        (
          porTamanho.get(
            item.tamanho
          ) ?? 0
        ) + item.saldo
      );
    }

    if (item.cor) {
      cores.add(
        item.cor
      );

      porCor.set(
        item.cor,

        (
          porCor.get(
            item.cor
          ) ?? 0
        ) + item.saldo
      );
    }
  }

  return {
    estoque:
      Math.round(estoque),

    tamanhos:
      [...tamanhos].sort(
        (a, b) =>
          a.localeCompare(
            b,
            "pt-BR",
            {
              numeric: true,
            }
          )
      ),

    cores:
      [...cores].sort(
        (a, b) =>
          a.localeCompare(
            b,
            "pt-BR"
          )
      ),

    estoquePorTamanho:
      Object.fromEntries(
        porTamanho
      ),

    estoquePorCor:
      Object.fromEntries(
        porCor
      ),
  };
}

/**
 * Busca imagens reais do produto pai.
 *
 * É utilizada apenas como fallback.
 */
async function fetchParentImages(
  id: string
): Promise<string[]> {
  try {
    const response =
      await tinyPost<TinyResponse>(
        "produto.obter.php",
        {
          id,
        }
      );

    const produto =
      response.data
        .retorno?.produto;

    if (
      !produto
    ) {
      return [];
    }

    return extractImages(
      produto
    );
  } catch {
    return [];
  }
}

/**
 * POST principal.
 *
 * A sincronização é dividida em:
 *
 * start
 * stock
 * finish
 */
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
      body?.tipo === "estoque" ||
      body?.tipo ===
        "novos_produtos" ||
      body?.tipo === "geral"
        ? body.tipo
        : "geral";

    const token =
      process.env.TINY_API_TOKEN?.trim();

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Variável TINY_API_TOKEN não encontrada.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================================
     * START
     * =====================================================
     */
    if (
      action === "start"
    ) {
      const startedAt =
        Date.now();

      const {
        products,
        apiLimit,
      } =
        await searchAllProducts();

      const groups =
        buildGroups(
          products
        );

      const totalVariacoes =
        groups.reduce(
          (
            total,
            group
          ) =>
            total +
            group.variations.length,
          0
        );

      return NextResponse.json(
        {
          success: true,

          action: "start",

          tipo,

          apiLimit,

          groups,

          estatisticas: {
            produtosPesquisa:
              products.length,

            grupos:
              groups.length,

            variacoes:
              totalVariacoes,

            duracaoMs:
              Date.now() -
              startedAt,
          },
        }
      );
    }

    /*
     * =====================================================
     * STOCK
     * =====================================================
     */
    if (
      action === "stock"
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
          Number(
            body?.offset
          ) || 0
        );

      const requestedBatch =
        Math.max(
          1,
          Number(
            body?.batchSize
          ) ||
            MAX_STOCK_BATCH
        );

      const batchSize =
        Math.min(
          MAX_STOCK_BATCH,
          requestedBatch
        );

      const batch =
        variations.slice(
          offset,
          offset +
            batchSize
        ) as StartVariation[];

      /*
       * Não existem mais variações.
       */
      if (
        batch.length === 0
      ) {
        return NextResponse.json(
          {
            success: true,

            action: "stock",

            stocks: [],

            nextOffset:
              offset,

            done: true,

            waitMs: 0,
          }
        );
      }

      const startedAt =
        Date.now();

      const results:
        StockResult[] = [];

      /*
       * IMPORTANTE:
       *
       * Não usamos Promise.all aqui.
       *
       * Isso evita excesso de concorrência
       * com a API do Tiny.
       */
      for (
        const variation
          of batch
      ) {
        const id =
          text(
            variation.id
          );

        if (!id) {
          throw new Error(
            "Variação sem ID."
          );
        }

        /*
         * Algumas contas podem devolver
         * estoque_atual na pesquisa.
         *
         * Se existir, economizamos uma chamada.
         */
        if (
          variation.estoque_atual !==
          undefined
        ) {
          results.push(
            {
              id,

              saldo:
                number(
                  variation.estoque_atual
                ),
            }
          );

          continue;
        }

        /*
         * Consulta REAL ao Tiny.
         */
        const stock =
          await getStock(
            id
          );

        results.push(
          stock
        );
      }

      /*
       * O frontend controla o intervalo
       * entre os lotes.
       *
       * Mantemos valor conservador.
       */
      const waitMs =
        Math.max(
          1000,
          Math.ceil(
            (
              results.length /
              DEFAULT_LIMIT_PER_MINUTE
            ) *
              60_000
          ) + 300
        );

      return NextResponse.json(
        {
          success: true,

          action: "stock",

          stocks:
            results,

          nextOffset:
            offset +
            batch.length,

          done:
            offset +
              batch.length >=
            variations.length,

          waitMs,

          duracaoMs:
            Date.now() -
            startedAt,
        }
      );
    }

    /*
     * =====================================================
     * FINISH
     * =====================================================
     */
    if (
      action === "finish"
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
            success: false,
            error:
              "Grupo de produto inválido para finalização.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * Relaciona cada estoque com
       * tamanho e cor da variação.
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
              group.variations.find(
                (v) =>
                  text(v.id) ===
                  text(item?.id)
              );

            return {
              id:
                text(
                  item?.id
                ),

              saldo:
                number(
                  item?.saldo
                ),

              tamanho:
                variation?.tamanho ??
                "",

              cor:
                variation?.cor ??
                "",
            };
          }
        );

      const aggregates =
        sumByKey(
          stocks
        );

      /*
       * Imagens vindas da pesquisa.
       */
      let imagens =
        [
          ...new Set(
            (
              group.imagens ??
              []
            ).filter(Boolean)
          ),
        ];

      /*
       * Se não houver imagem,
       * tenta obter diretamente do pai.
       */
      if (
        imagens.length === 0
      ) {
        imagens =
          await fetchParentImages(
            group.id
          );
      }

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
       * Procura primeiro pelo ID do Tiny.
       *
       * Se o produto foi criado manualmente
       * anteriormente, fazemos fallback pelo nome.
       */
      const existentePorId =
        await prisma.produto.findUnique(
          {
            where: {
              id: group.id,
            },
          }
        );

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

      /*
       * =====================================================
       * NOVOS PRODUTOS
       * =====================================================
       */
      if (
        tipo ===
        "novos_produtos"
      ) {
        if (existente) {
          return NextResponse.json(
            {
              success: true,
              action: "finish",
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
                aggregates.estoque,

              tamanhos:
                aggregates.tamanhos,

              cores:
                aggregates.cores,

              estoquePorTamanho:
                aggregates.estoquePorTamanho,

              estoquePorCor:
                aggregates.estoquePorCor,

              imagemUrl:
                imageUrl,

              imagens:
                imageData,

              ativo: true,
            },
          }
        );

        return NextResponse.json(
          {
            success: true,
            action: "finish",
            status:
              "created",
          }
        );
      }

      /*
       * =====================================================
       * SOMENTE ESTOQUE
       * =====================================================
       */
      if (
        tipo === "estoque"
      ) {
        if (!existente) {
          return NextResponse.json(
            {
              success: true,

              action: "finish",

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
                aggregates.estoque,

              tamanhos:
                aggregates.tamanhos,

              cores:
                aggregates.cores,

              estoquePorTamanho:
                aggregates.estoquePorTamanho,

              estoquePorCor:
                aggregates.estoquePorCor,
            },
          }
        );

        return NextResponse.json(
          {
            success: true,

            action: "finish",

            status:
              "updated",
          }
        );
      }

      /*
       * =====================================================
       * GERAL
       * =====================================================
       */
      if (existente) {
        await prisma.produto.update(
          {
            where: {
              id:
                existente.id,
            },

            data: {
              nome:
                group.nome,

              descricao:
                group.descricao,

              preco:
                group.preco,

              precoPromocional:
                group.precoPromocional,

              estoque:
                aggregates.estoque,

              tamanhos:
                aggregates.tamanhos,

              cores:
                aggregates.cores,

              estoquePorTamanho:
                aggregates.estoquePorTamanho,

              estoquePorCor:
                aggregates.estoquePorCor,

              ...(imagens.length >
              0
                ? {
                    imagemUrl:
                      imageUrl,

                    imagens:
                      imageData,
                  }
                : {}),
            },
          }
        );

        return NextResponse.json(
          {
            success: true,

            action: "finish",

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
              aggregates.estoque,

            tamanhos:
              aggregates.tamanhos,

            cores:
              aggregates.cores,

            estoquePorTamanho:
              aggregates.estoquePorTamanho,

            estoquePorCor:
              aggregates.estoquePorCor,

            imagemUrl:
              imageUrl,

            imagens:
              imageData,

            ativo: true,
          },
        }
      );

      return NextResponse.json(
        {
          success: true,

          action: "finish",

          status:
            "created",
        }
      );
    }

    /*
     * Ação inválida.
     */
    return NextResponse.json(
      {
        success: false,

        error:
          "Ação de sincronização inválida. Use start, stock ou finish.",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "🔥 ERRO NA SINCRONIZAÇÃO TINY:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Erro interno ao processar sincronização com o Tiny.",

        details:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      },
      {
        status: 500,
      }
    );
  }
}
