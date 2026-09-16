import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL =
  "https://api.tiny.com.br/api2";

const DEFAULT_LIMIT_PER_MINUTE = 20;

/*
 * Lotes pequenos para não sobrecarregar
 * a API do Tiny.
 */
const MAX_STOCK_BATCH = 3;

/*
 * Máximo de páginas da pesquisa.
 */
const MAX_SEARCH_PAGES = 100;

const PLACEHOLDER_IMAGE =
  "https://via.placeholder.com/300";

type SyncType =
  | "geral"
  | "estoque"
  | "novos_produtos";

type Action =
  | "start"
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
   * N = Normal
   * P = Pai
   * V = Variação
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
    status_processamento?: string | number;
    codigo_erro?: string | number;

    mensagem?: string;

    erros?: Array<{
      erro?: string;
      descricao?: string;
    }>;

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
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return 0;
  }

  const normalized =
    raw.includes(",")
      ? raw
          .replace(/\./g, "")
          .replace(",", ".")
      : raw;

  const result =
    Number(normalized);

  return Number.isFinite(result)
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

  return toNumber(value);
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
 * ORDENAÇÃO DOS TAMANHOS
 * =======================================================*/

/**
 * Ordem desejada:
 *
 * PP
 * P
 * M
 * G
 * GG
 * XGG
 * XXG...
 *
 * E:
 *
 * 1
 * 2
 * 3
 * ...
 * 16
 */

function tamanhoPeso(
  tamanho: string
): number {
  const raw =
    normalize(
      tamanho
    );

  /*
   * Numéricos:
   * 1 -> 1
   * 16 -> 16
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

  const especiais:
    Record<
      string,
      number
    > = {
      "pp": 100,
      "p": 200,
      "m": 300,
      "g": 400,
      "gg": 500,
      "xg": 600,
      "xgg": 600,
      "xxg": 700,
      "xxgg": 700,
      "xxxg": 800,
      "eg": 800,
      "egg": 900,
    };

  if (
    especiais[raw] !==
    undefined
  ) {
    return especiais[raw];
  }

  /*
   * Tamanhos compostos:
   * 2/3
   * 4/6
   * 10/12
   */
  const match =
    raw.match(
      /^(\d+)/
    );

  if (match) {
    const n =
      Number(match[1]);

    if (
      Number.isFinite(n)
    ) {
      return n;
    }
  }

  /*
   * Outros tamanhos ficam depois
   * dos conhecidos.
   */
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
        pesoA !==
        pesoB
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
 * ERRO TINY
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
 * TINY POST
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
    normalize(message);

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

  /*
   * Erro lógico retornado pelo Tiny
   * mesmo com HTTP 200.
   */
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
    product.anexos ?? []
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
 * NOME
 * =======================================================*/

function baseName(
  name: string
): string {
  const parts =
    name
      .split(" - ")
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  /*
   * Só remove tamanho/cor quando
   * realmente temos pelo menos 3 partes.
   */
  if (
    parts.length >= 3
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

function gradeFromName(
  name: string
): {
  tamanho: string;
  cor: string;
} {
  const parts =
    name
      .split(" - ")
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  if (
    parts.length < 3
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
        text(rawKey)
      );

    const value =
      text(rawValue);

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
        key === "tam" ||
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
        Array.isArray(item)
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

/* =========================================================
 * VARIAÇÕES DO PAI
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
      Array.isArray(value)
    ) {
      return;
    }

    const objectValue =
      value as Record<
        string,
        unknown
      >;

    let candidate:
      unknown = value;

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
      typeof candidate !==
        "object" ||
      Array.isArray(candidate)
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
    page <= MAX_SEARCH_PAGES
  ) {
    const response =
      await tinyPost<
        TinyResponse
      >(
        "produtos.pesquisa.php",
        {
          pesquisa:
            "",
          pagina:
            page,

          /*
           * NÃO usamos situacao: A.
           *
           * Queremos todo o catálogo
           * que não esteja excluído.
           */
        }
      );

    apiLimit =
      Number(
        response.headers.get(
          "x-limit-api"
        )
      ) ||
      DEFAULT_LIMIT_PER_MINUTE;

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
       * Excluído não entra.
       *
       * Inativos entram.
       */
      if (
        text(
          product.situacao
        ).toUpperCase() ===
        "E"
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
      ) ||
      page;

    page++;

    if (
      page <=
      totalPages
    ) {
      /*
       * Mais espaçado para evitar
       * novo bloqueio.
       */
      await sleep(
        1500
      );
    }
  }

  /*
   * Remove IDs duplicados.
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
    products: [
      ...unique.values(),
    ],

    apiLimit,

    paginas:
      totalPages,
  };
}

/* =========================================================
 * GRUPOS
 * =======================================================*/

function buildGroups(
  products: TinyProduct[]
): {
  groups: StartGroup[];
  normais: number;
  pais: number;
  variacoes: number;
  variacoesAgrupadas: number;
  variacoesOrfas: number;
} {
  const parents =
    new Map<
      string,
      TinyProduct
    >();

  const parentsByName =
    new Map<
      string,
      string
    >();

  const parentsByCode =
    new Map<
      string,
      string
    >();

  let normais = 0;
  let pais = 0;
  let variacoes = 0;
  let variacoesOrfas = 0;

  /*
   * Primeiro encontramos os PAIS.
   */
  for (
    const product of
    products
  ) {
    const type =
      text(
        product.tipoVariacao
      ).toUpperCase();

    if (
      type !==
      "P"
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

    parents.set(
      id,
      product
    );

    const nameKey =
      normalize(
        baseName(
          text(
            product.nome
          )
        )
      );

    if (
      nameKey
    ) {
      parentsByName.set(
        nameKey,
        id
      );
    }

    const code =
      normalize(
        text(
          product.codigo
        )
      );

    if (
      code
    ) {
      parentsByCode.set(
        code,
        id
      );
    }
  }

  const groups =
    new Map<
      string,
      StartGroup
    >();

  const seen =
    new Map<
      string,
      Set<string>
    >();

  const ensureGroup =
    (
      id: string,
      product: TinyProduct
    ) => {
      if (
        groups.has(id)
      ) {
        return;
      }

      const nome =
        text(
          product.nome
        ) ||
        `Produto ${id}`;

      const nomeBase =
        baseName(
          nome
        ) || nome;

      const promo =
        optionalNumber(
          product
            .preco_promocional
        );

      groups.set(
        id,
        {
          id,

          nome:
            nomeBase,

          descricao:
            text(
              product
                .descricao_complementar
            ) ||
            text(
              product.obs
            ) ||
            nomeBase,

          preco:
            toNumber(
              product.preco
            ),

          precoPromocional:
            promo ??
            null,

          imagens:
            extractImages(
              product
            ),

          tipoVariacao:
            text(
              product
                .tipoVariacao
            ),

          variations:
            [],
        }
      );

      seen.set(
        id,
        new Set()
      );
    };

  /*
   * -------------------------------------------------------
   * PRODUTOS NORMAIS
   * -------------------------------------------------------
   */
  for (
    const product of
    products
  ) {
    const type =
      text(
        product
          .tipoVariacao
      ).toUpperCase();

    if (
      type !==
      "N"
    ) {
      continue;
    }

    normais++;

    const id =
      text(
        product.id
      );

    if (!id) {
      continue;
    }

    ensureGroup(
      id,
      product
    );

    const group =
      groups.get(id)!;

    const used =
      seen.get(id)!;

    if (
      used.has(id)
    ) {
      continue;
    }

    used.add(id);

    let grade =
      gradeFromTiny(
        product.grade
      );

    if (
      !grade.tamanho &&
      !grade.cor
    ) {
      grade =
        gradeFromName(
          text(
            product.nome
          )
        );
    }

    group.variations.push({
      id,

      tamanho:
        grade.tamanho,

      cor:
        grade.cor,

      /*
       * Guardamos apenas como
       * otimização.
       *
       * O stock action continua podendo
       * consultar o estoque real.
       */
      ...(product.estoque_atual !==
      undefined
        ? {
            estoque_atual:
              toNumber(
                product.estoque_atual
              ),
          }
        : {}),
    });
  }

  /*
   * -------------------------------------------------------
   * PRODUTOS PAIS
   * -------------------------------------------------------
   */
  for (
    const [
      parentId,
      parent,
    ] of parents
  ) {
    ensureGroup(
      parentId,
      parent
    );

    const group =
      groups.get(
        parentId
      )!;

    const used =
      seen.get(
        parentId
      )!;

    /*
     * O Tiny pode devolver as variações
     * diretamente no produto pai.
     */
    const variations =
      normalizeVariations(
        parent.variacoes
      );

    for (
      const variation of
      variations
    ) {
      const variationId =
        text(
          variation.id
        );

      if (
        !variationId ||
        used.has(
          variationId
        )
      ) {
        continue;
      }

      used.add(
        variationId
      );

      let grade =
        gradeFromTiny(
          variation.grade
        );

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

      group.variations.push({
        id:
          variationId,

        tamanho:
          grade.tamanho,

        cor:
          grade.cor,

        ...(variation.estoque_atual !==
        undefined
          ? {
              estoque_atual:
                toNumber(
                  variation.estoque_atual
                ),
            }
          : {}),
      });
    }
  }

  /*
   * -------------------------------------------------------
   * VARIAÇÕES RETORNADAS NA PESQUISA
   * -------------------------------------------------------
   */
  for (
    const product of
    products
  ) {
    const type =
      text(
        product
          .tipoVariacao
      ).toUpperCase();

    if (
      type !==
      "V"
    ) {
      continue;
    }

    variacoes++;

    const variationId =
      text(
        product.id
      );

    if (!variationId) {
      continue;
    }

    /*
     * 1. Pai informado pelo Tiny.
     */
    let parentId =
      text(
        product
          .idProdutoPai
      );

    /*
     * 2. Busca pelo nome.
     */
    if (!parentId) {
      const nameKey =
        normalize(
          baseName(
            text(
              product.nome
            )
          )
        );

      parentId =
        parentsByName.get(
          nameKey
        ) || "";
    }

    /*
     * 3. Busca pelo código.
     */
    if (
      !parentId &&
      product.codigo
    ) {
      const code =
        normalize(
          text(
            product.codigo
          )
        );

      parentId =
        parentsByCode.get(
          code
        ) || "";
    }

    /*
     * 4. Último recurso:
     *
     * procura se o nome base do produto
     * coincide com o nome de algum pai.
     */
    if (!parentId) {
      const variationBase =
        normalize(
          baseName(
            text(
              product.nome
            )
          )
        );

      for (
        const [
          candidateId,
          parent,
        ] of parents
      ) {
        const parentName =
          normalize(
            baseName(
              text(
                parent.nome
              )
            )
          );

        if (
          variationBase &&
          parentName &&
          variationBase ===
            parentName
        ) {
          parentId =
            candidateId;

          break;
        }
      }
    }

    /*
     * MUITO IMPORTANTE:
     *
     * Nunca transforme V em produto.
     */
    if (
      !parentId ||
      !parents.has(
        parentId
      )
    ) {
      variacoesOrfas++;
      continue;
    }

    ensureGroup(
      parentId,
      parents.get(
        parentId
      )!
    );

    const group =
      groups.get(
        parentId
      )!;

    const used =
      seen.get(
        parentId
      )!;

    if (
      used.has(
        variationId
      )
    ) {
      continue;
    }

    used.add(
      variationId
    );

    let grade =
      gradeFromTiny(
        product.grade
      );

    if (
      !grade.tamanho &&
      !grade.cor
    ) {
      grade =
        gradeFromName(
          text(
            product.nome
          )
        );
    }

    group.variations.push({
      id:
        variationId,

      tamanho:
        grade.tamanho,

      cor:
        grade.cor,

      ...(product.estoque_atual !==
      undefined
        ? {
            estoque_atual:
              toNumber(
                product.estoque_atual
              ),
          }
        : {}),
    });
  }

  /*
   * Ordena as variações dentro
   * de cada produto por tamanho.
   */
  for (
    const group of
    groups.values()
  ) {
    group.variations.sort(
      (a, b) => {
        const sizeA =
          tamanhoPeso(
            a.tamanho
          );

        const sizeB =
          tamanhoPeso(
            b.tamanho
          );

        if (
          sizeA !==
          sizeB
        ) {
          return (
            sizeA -
            sizeB
          );
        }

        return a.cor.localeCompare(
          b.cor,
          "pt-BR"
        );
      }
    );
  }

  const totalAgrupadas =
    [...groups.values()]
      .reduce(
        (
          total,
          group
        ) =>
          total +
          group
            .variations
            .filter(
              (variation) =>
                variation.id
            )
            .length,
        0
      );

  return {
    groups: [
      ...groups.values(),
    ],

    normais,

    pais,

    variacoes,

    variacoesAgrupadas:
      totalAgrupadas,

    variacoesOrfas,
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
   * Fonte principal:
   * saldo.
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
  let total = 0;

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
      ) ===
      "s"
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
 * AGREGAÇÃO
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

  let estoque = 0;

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
        buildGroups(
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
              result.variacoesAgrupadas,

            variacoesOrfas:
              result.variacoesOrfas,

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
         * A partir de agora usamos
         * o endpoint REAL do Tiny.
         *
         * Não confiamos no estoque da pesquisa.
         */
        const stock =
          await getStock(
            id
          );

        results.push(
          stock
        );

        /*
         * Pequeno espaçamento entre
         * chamadas individuais.
         */
        await sleep(
          1500
        );
      }

      /*
       * Próximo lote precisa aguardar.
       */
      const waitMs =
        Math.max(
          5000,
          results.length *
            2500
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
       * Relaciona cada estoque
       * à sua variação.
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
              group
                .variations
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
       * Primeiro pelo ID do Tiny.
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
       * Novo produto.
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

    return NextResponse.json(
      {
        success:
          false,

        error:
          "Ação de sincronização inválida. Use start, stock ou finish.",
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
