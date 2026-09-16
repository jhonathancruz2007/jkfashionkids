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
 * Consultamos poucos SKUs por lote.
 */
const MAX_STOCK_BATCH = 3;

const PLACEHOLDER_IMAGE =
  "https://via.placeholder.com/300";

type SyncType =
  | "geral"
  | "estoque"
  | "novos_produtos";

type Action =
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

type TinyVariationMapping = {
  id: string;
  codigo: string;
  tamanho: string;
  cor: string;
};

type StartVariation = {
  id: string;
  codigo: string;
  tamanho: string;
  cor: string;
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
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
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

async function tinyPost<T>(
  endpoint: string,
  params: Record<
    string,
    string | number
  >
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

  const response =
    await fetch(
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
    throw new Error(
      "API Bloqueada - Excedido o número de acessos a API, aguarde alguns minutos e tente novamente."
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
    throw new Error(
      message
    );
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
  const products:
    TinyProduct[] = [];

  let page = 1;

  let totalPages = 1;

  let apiLimit =
    DEFAULT_LIMIT_PER_MINUTE;

  while (
    page <= totalPages &&
    page <=
      MAX_SEARCH_PAGES
  ) {
    const response =
      await tinyPost<
        TinyResponse
      >(
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
      response.data
        .retorno;

    if (
      !retorno ||
      retorno.status !==
        "OK"
    ) {
      throw new Error(
        tinyErrorMessage(
          response.data
        )
      );
    }

    for (
      const item of
      retorno.produtos ??
      []
    ) {
      const product =
        item?.produto;

      if (
        !product?.id
      ) {
        continue;
      }

      /*
       * Excluídos não entram.
       *
       * Ativos e inativos entram.
       */
      if (
        normalize(
          text(
            product.situacao
          )
        ) === "e"
      ) {
        continue;
      }

      products.push(
        product
      );
    }

    totalPages =
      toNumber(
        retorno.numero_paginas
      ) || page;

    page++;

    if (
      page <=
      totalPages
    ) {
      await sleep(
        1500
      );
    }
  }

  /*
   * Remove duplicidades.
   */
  const unique =
    new Map<
      string,
      TinyProduct
    >();

  for (
    const product of
    products
  ) {
    const id =
      text(
        product.id
      );

    if (id) {
      unique.set(
        id,
        product
      );
    }
  }

  return {
    products:
      [
        ...unique.values(),
      ],

    apiLimit,

    paginas:
      totalPages,
  };
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
 * V será recuperada posteriormente
 * pelo DETAILS.
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
       * As V serão preenchidas em DETAILS.
       */
      variations: [],
    });
  }

  /*
   * Apenas contamos as V.
   *
   * Elas NÃO viram grupos.
   */
  variacoes =
    products.filter(
      (product) =>
        text(
          product.tipoVariacao
        ).toUpperCase() ===
        "V"
    ).length;

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
  id: string
): Promise<TinyProduct> {
  const response =
    await tinyPost<
      TinyResponse
    >(
      "produto.obter.php",
      {
        id,
      }
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
       * NOVO:
       * guardamos também o código
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
  id: string
): Promise<StockResult> {
  const response =
    await tinyPost<
      TinyResponse
    >(
      "produto.obter.estoque.php",
      {
        id,
      }
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
 * MONTA O MAPA DAS VARIAÇÕES
 * =======================================================*/

function buildTinyVariationMap(
  group: StartGroup
): TinyVariationMapping[] {
  return (
    group.variations ?? []
  )
    .map(
      (variation) => ({
        id:
          text(
            variation.id
          ),

        codigo:
          text(
            variation.codigo
          ),

        tamanho:
          text(
            variation.tamanho
          ),

        cor:
          text(
            variation.cor
          ),
      })
    )
    .filter(
      (variation) =>
        Boolean(
          variation.id
        )
    );
}

/* =========================================================
 * SALVA O VÍNCULO TINY NO PRODUTO
 * =======================================================*/

function buildTinyFields(
  group: StartGroup
) {
  const tinyVariacoes =
    buildTinyVariationMap(
      group
    );

  return {
    /*
     * ID do produto pai/normal no Tiny.
     *
     * Para P:
     *   é o ID do produto pai.
     *
     * Para N:
     *   é o próprio ID do produto.
     */
    tinyId:
      group.id,

    /*
     * Mapeamento:
     *
     * tamanho + cor
     * ->
     * ID da variação no Tiny
     */
    tinyVariacoes:
      tinyVariacoes,
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
          Number(
            body?.offset
          ) || 0
        );

      const requested =
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
          requested
        );

      const batch =
        variations.slice(
          offset,
          offset +
            batchSize
        ) as StartVariation[];

      if (
        batch.length ===
        0
      ) {
        return NextResponse.json(
          {
            success:
              true,

            action:
              "stock",

            stocks:
              [],

            nextOffset:
              offset,

            done:
              true,

            waitMs:
              0,
          }
        );
      }

      const startedAt =
        Date.now();

      const results:
        StockResult[] =
        [];

      /*
       * SEM Promise.all.
       *
       * Uma chamada por vez.
       */
      for (
        const variation of
        batch
      ) {
        const id =
          text(
            variation.id
          );

        if (!id) {
          continue;
        }

        /*
         * Sempre consulta o
         * estoque real.
         */
        const stock =
          await getStock(
            id
          );

        results.push(
          stock
        );

        /*
         * Espaço entre chamadas
         * individuais.
         */
        await sleep(
          2000
        );
      }

      /*
       * Pausa segura antes do lote seguinte.
       */
      const waitMs =
        Math.max(
          8000,
          results.length *
            3000
        );

      return NextResponse.json(
        {
          success:
            true,

          action:
            "stock",

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
       * ===================================================
       * MAPA DE VARIAÇÕES TINY
       * ===================================================
       */
      const tinyFields =
        buildTinyFields(
          group
        );

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

              data: {
                ...tinyFields,
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
                "ignored",

              tinyVariacoes:
                tinyFields
                  .tinyVariacoes
                  .length,
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

              /*
               * NOVOS CAMPOS
               */
              ...tinyFields,
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

            tinyVariacoes:
              tinyFields
                .tinyVariacoes
                .length,
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

              /*
               * Mesmo no modo estoque,
               * mantemos o vínculo Tiny.
               */
              ...tinyFields,
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

            tinyVariacoes:
              tinyFields
                .tinyVariacoes
                .length,
          }
        );
      }

      /* ===================================================
       * GERAL
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

              ...(imagens.length >
              0
                ? {
                    imagemUrl:
                      imageUrl,

                    imagens:
                      imageData,
                  }
                : {}),

              /*
               * NOVOS CAMPOS:
               * vínculo com Tiny.
               */
              ...tinyFields,
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

            tinyVariacoes:
              tinyFields
                .tinyVariacoes
                .length,
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

            /*
             * NOVOS CAMPOS
             */
            ...tinyFields,
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

          tinyVariacoes:
            tinyFields
              .tinyVariacoes
              .length,
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
          "Ação de sincronização inválida. Use start, details, stock ou finish.",
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

    return NextResponse.json(
      {
        success:
          false,

        error:
          "Erro interno ao processar sincronização com o Tiny.",

        details:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      },
      {
        status:
          500,
      }
    );
  }
}
