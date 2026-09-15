import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";

const DEFAULT_LIMIT_PER_MINUTE = 20;
const MAX_SEARCH_PAGES = 100;
const MAX_STOCK_BATCH = 5;

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

function text(value: unknown): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function toNumber(value: unknown): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const raw = String(value).trim();

  if (!raw) {
    return 0;
  }

  /*
   * "50,90" -> 50.9
   * "50.90" -> 50.9
   */
  const normalized = raw.includes(",")
    ? raw
        .replace(/\./g, "")
        .replace(",", ".")
    : raw;

  const result = Number(normalized);

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

  const result =
    toNumber(value);

  return Number.isFinite(result)
    ? result
    : undefined;
}

function normalize(
  value: string
): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sleep(
  ms: number
): Promise<void> {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

/* =========================================================
 * ERROS DO TINY
 * =======================================================*/

function tinyErrorMessage(
  data: TinyResponse,
  fallback =
    "O Tiny não retornou os dados solicitados."
): string {
  const errors =
    (
      data.retorno?.erros ?? []
    )
      .map(
        (item) =>
          text(item?.erro) ||
          text(item?.descricao)
      )
      .filter(Boolean);

  if (errors.length > 0) {
    return errors.join(" | ");
  }

  const mensagem =
    text(
      data.retorno?.mensagem
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
  >,
  retries = 2
): Promise<{
  data: T;
  headers: Headers;
  status: number;
}> {
  const token =
    process.env.TINY_API_TOKEN?.trim();

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
    Object.entries(params)
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
        method: "POST",

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
      JSON.parse(raw) as T;
  } catch {
    if (
      retries > 0 &&
      (
        response.status === 429 ||
        response.status >= 500
      )
    ) {
      await sleep(3000);

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

  const message =
    tinyErrorMessage(
      typedData,
      `Erro HTTP ${response.status}.`
    );

  const messageNormalized =
    normalize(message);

  /*
   * O Tiny pode retornar bloqueio
   * mesmo com HTTP 200.
   */
  const blocked =
    messageNormalized.includes(
      "api bloqueada"
    ) ||
    messageNormalized.includes(
      "excedido o numero de acessos"
    ) ||
    messageNormalized.includes(
      "limite"
    );

  if (
    response.status === 429 ||
    blocked
  ) {
    if (retries > 0) {
      await sleep(7000);

      return tinyPost<T>(
        endpoint,
        params,
        retries - 1
      );
    }

    throw new Error(
      message ||
        "A API do Tiny está temporariamente bloqueada por excesso de acessos. Aguarde alguns minutos antes de tentar novamente."
    );
  }

  if (!response.ok) {
    throw new Error(
      `Tiny respondeu HTTP ${response.status} em ${endpoint}: ${message}`
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
 * LIMITE
 * =======================================================*/

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
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }

  return (
    DEFAULT_LIMIT_PER_MINUTE
  );
}

/* =========================================================
 * IMAGENS
 * =======================================================*/

function extractImages(
  product: TinyProduct
): string[] {
  const urls: string[] =
    [];

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
    product.imagens_externas ?? []
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
    ...new Set(urls),
  ];
}

/* =========================================================
 * GRADE
 * =======================================================*/

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
    Array.isArray(grade)
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
        const [key, value] of
        Object.entries(item)
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
      const [key, value] of
      Object.entries(grade)
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
 * NOME BASE
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
   * Produto - Tamanho - Cor
   */
  if (
    parts.length >= 3
  ) {
    return parts
      .slice(0, -2)
      .join(" - ")
      .trim();
  }

  return name.trim();
}

/* =========================================================
 * VARIAÇÕES EMBUTIDAS NO PAI
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
        "object"
    ) {
      return;
    }

    if (
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
      typeof
        objectValue.variacao ===
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
      candidate as TinyVariation;

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
    Array.isArray(raw)
  ) {
    for (
      const item of raw
    ) {
      pushCandidate(item);
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
      pushCandidate(item);
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
      text(item.id),
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
      await tinyPost<TinyResponse>(
        "produtos.pesquisa.php",
        {
          pesquisa: "",
          pagina: page,

          /*
           * Somente ativos.
           */
          situacao: "A",
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
      retorno.produtos ?? []
    ) {
      const product =
        item?.produto;

      if (
        !product?.id
      ) {
        continue;
      }

      /*
       * Segurança adicional.
       */
      if (
        text(
          product.situacao
        ).toUpperCase() !==
        "A"
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

    /*
     * Intervalo conservador
     * entre páginas.
     */
    if (
      page <= totalPages
    ) {
      await sleep(1000);
    }
  }

  return {
    products,
    apiLimit,
    paginas:
      totalPages,
  };
}

/* =========================================================
 * CONSTRUÇÃO DOS GRUPOS
 *
 * REGRA FUNDAMENTAL:
 *
 * N = vira produto
 * P = vira produto pai
 * V = NUNCA vira produto sozinho
 * =======================================================*/

function buildGroups(
  products: TinyProduct[]
): {
  groups: StartGroup[];
  normais: number;
  pais: number;
  variacoes: number;
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

  let normais = 0;
  let pais = 0;
  let variacoes = 0;
  let variacoesOrfas = 0;

  /*
   * -------------------------------------------------------
   * 1. PRIMEIRO: identificar todos os pais.
   * -------------------------------------------------------
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
      type !== "P"
    ) {
      continue;
    }

    const id =
      text(product.id);

    if (!id) {
      continue;
    }

    pais++;

    parents.set(
      id,
      product
    );

    const nomeBase =
      normalize(
        baseName(
          text(
            product.nome
          )
        )
      );

    if (nomeBase) {
      parentsByName.set(
        nomeBase,
        id
      );
    }
  }

  const groups =
    new Map<
      string,
      StartGroup
    >();

  const seenVariationIds =
    new Map<
      string,
      Set<string>
    >();

  const ensureGroup = (
    groupId: string,
    representative: TinyProduct
  ) => {
    if (
      groups.has(
        groupId
      )
    ) {
      return;
    }

    const nome =
      text(
        representative.nome
      ) ||
      `Produto ${groupId}`;

    const base =
      baseName(nome);

    const precoPromocional =
      optionalNumber(
        representative
          .preco_promocional
      );

    groups.set(
      groupId,
      {
        id:
          groupId,

        nome:
          base || nome,

        descricao:
          text(
            representative
              .descricao_complementar
          ) ||
          text(
            representative.obs
          ) ||
          base ||
          nome,

        preco:
          toNumber(
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
            representative
              .tipoVariacao
          ),

        variations:
          [],
      }
    );

    seenVariationIds.set(
      groupId,
      new Set()
    );
  };

  /*
   * -------------------------------------------------------
   * 2. PRODUTOS NORMAIS
   *
   * Cada N é um produto independente.
   * -------------------------------------------------------
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
      type !== "N"
    ) {
      continue;
    }

    normais++;

    const id =
      text(product.id);

    if (!id) {
      continue;
    }

    ensureGroup(
      id,
      product
    );

    const group =
      groups.get(id)!;

    const seen =
      seenVariationIds.get(id)!;

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    const grade =
      gradeFromTiny(
        product.grade
      );

    group.variations.push({
      id,

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
   * -------------------------------------------------------
   * 3. PRODUTOS PAIS
   *
   * Cada P vira UM produto.
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

    /*
     * Algumas respostas do Tiny já
     * trazem as variações dentro de:
     *
     * parent.variacoes[]
     *
     * Aproveitamos isso sem nova chamada.
     */
    const embedded =
      normalizeVariations(
        parent.variacoes
      );

    if (
      embedded.length === 0
    ) {
      continue;
    }

    const group =
      groups.get(
        parentId
      )!;

    const seen =
      seenVariationIds.get(
        parentId
      )!;

    for (
      const variation of
      embedded
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
        id,

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
   * 4. VARIAÇÕES RETORNADAS COMO V
   *
   * NUNCA criar produto a partir de V.
   * -------------------------------------------------------
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
      type !== "V"
    ) {
      continue;
    }

    variacoes++;

    const variationId =
      text(product.id);

    if (
      !variationId
    ) {
      continue;
    }

    /*
     * PRIMEIRA TENTATIVA:
     *
     * idProdutoPai
     */
    let parentId =
      text(
        product.idProdutoPai
      );

    /*
     * SEGUNDA TENTATIVA:
     *
     * nome base.
     */
    if (
      !parentId
    ) {
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
     * TERCEIRA TENTATIVA:
     *
     * tenta descobrir pelo código.
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

      for (
        const [
          candidateId,
          parent,
        ] of parents
      ) {
        const parentCode =
          normalize(
            text(
              parent.codigo
            )
          );

        if (
          parentCode &&
          code.startsWith(
            parentCode
          )
        ) {
          parentId =
            candidateId;
          break;
        }
      }
    }

    /*
     * AQUI ESTÁ A CORREÇÃO MAIS IMPORTANTE:
     *
     * se não encontramos o pai,
     * NÃO criamos um novo produto.
     */
    if (
      !parentId
    ) {
      variacoesOrfas++;
      continue;
    }

    /*
     * Se o pai não existe na lista
     * ativa, também NÃO criamos
     * a variação como produto.
     */
    if (
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

    const seen =
      seenVariationIds.get(
        parentId
      )!;

    if (
      seen.has(
        variationId
      )
    ) {
      continue;
    }

    seen.add(
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

    const estoqueAtual =
      optionalNumber(
        product.estoque_atual
      );

    group.variations.push({
      id:
        variationId,

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
    });
  }

  return {
    groups: [
      ...groups.values(),
    ],

    normais,

    pais,

    variacoes,

    variacoesOrfas,
  };
}

/* =========================================================
 * ESTOQUE
 * =======================================================*/

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

  const product =
    retorno.produto;

  const saldoDireto =
    optionalNumber(
      product.saldo
    );

  /*
   * O teste que você fez confirmou
   * que esse é o campo correto.
   */
  if (
    saldoDireto !==
    undefined
  ) {
    return {
      id,
      saldo:
        saldoDireto,
    };
  }

  /*
   * Fallback por depósitos.
   */
  const total =
    (
      product.depositos ??
      []
    ).reduce(
      (
        total,
        item
      ) => {
        const deposito =
          item?.deposito;

        if (
          !deposito
        ) {
          return total;
        }

        if (
          normalize(
            text(
              deposito.desconsiderar
            )
          ) === "s"
        ) {
          return total;
        }

        return (
          total +
          toNumber(
            deposito.saldo
          )
        );
      },
      0
    );

  return {
    id,

    saldo:
      total,
  };
}

/* =========================================================
 * CONSOLIDAÇÃO
 * =======================================================*/

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
    new Map<
      string,
      number
    >();

  const porCor =
    new Map<
      string,
      number
    >();

  const tamanhos =
    new Set<string>();

  const cores =
    new Set<string>();

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
      tamanhos.add(
        item.tamanho
      );

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
      cores.add(
        item.cor
      );

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

  return {
    estoque:
      Math.round(
        estoque
      ),

    tamanhos:
      [
        ...tamanhos,
      ].sort(
        (a, b) =>
          a.localeCompare(
            b,
            "pt-BR",
            {
              numeric:
                true,
            }
          )
      ),

    cores:
      [
        ...cores,
      ].sort(
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

      const {
        groups,
        normais,
        pais,
        variacoes,
        variacoesOrfas,
      } =
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
            group.variations
              .length,
          0
        );

      return NextResponse.json(
        {
          success:
            true,

          action:
            "start",

          tipo,

          apiLimit,

          groups,

          estatisticas: {
            /*
             * Registros efetivamente
             * recebidos da pesquisa.
             */
            registrosAtivosRecebidos:
              products.length,

            /*
             * Deve mostrar os seus
             * produtos simples.
             */
            produtosNormais:
              normais,

            /*
             * Número de pais.
             */
            produtosPais:
              pais,

            /*
             * Quantidade de V recebidos.
             */
            variacoes:
              variacoes,

            /*
             * V realmente colocadas
             * dentro dos pais.
             */
            variacoesAgrupadas:
              totalVariacoes,

            /*
             * V que não conseguimos
             * relacionar a um pai.
             *
             * Essas NÃO serão criadas
             * como produtos.
             */
            variacoesOrfas:
              variacoesOrfas,

            /*
             * Número real de produtos
             * que o site irá processar.
             */
            grupos:
              groups.length,

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
       * Fazemos uma chamada por vez.
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
          throw new Error(
            "Variação sem ID."
          );
        }

        /*
         * Se a pesquisa já trouxe
         * estoque_atual, não fazemos
         * outra chamada.
         */
        if (
          variation.estoque_atual !==
          undefined
        ) {
          results.push({
            id,

            saldo:
              toNumber(
                variation.estoque_atual
              ),
          });

          continue;
        }

        const stock =
          await getStock(
            id
          );

        results.push(
          stock
        );
      }

      /*
       * Intervalo entre lotes.
       */
      const waitMs =
        Math.max(
          5000,
          Math.ceil(
            (
              results.length /
              DEFAULT_LIMIT_PER_MINUTE
            ) *
              60000
          ) + 2000
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
       * Liga o estoque ao tamanho
       * e à cor da variação.
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
                  text(
                    item?.id
                  )
              );

            return {
              id:
                text(
                  item?.id
                ),

              saldo:
                toNumber(
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
       * Imagens que vieram diretamente
       * da pesquisa.
       *
       * Não fazemos uma segunda chamada
       * ao Tiny apenas por imagem.
       */
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
       *
       * Isso permite aproveitar
       * produtos que já existiam
       * no site antes da sincronização.
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
                aggregates.estoque,

              tamanhos:
                aggregates.tamanhos,

              estoquePorTamanho:
                aggregates.estoquePorTamanho,

              cores:
                aggregates.cores,

              estoquePorCor:
                aggregates.estoquePorCor,

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
                aggregates.estoque,

              tamanhos:
                aggregates.tamanhos,

              estoquePorTamanho:
                aggregates.estoquePorTamanho,

              cores:
                aggregates.cores,

              estoquePorCor:
                aggregates.estoquePorCor,
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
                aggregates.estoque,

              tamanhos:
                aggregates.tamanhos,

              estoquePorTamanho:
                aggregates.estoquePorTamanho,

              cores:
                aggregates.cores,

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
              aggregates.estoque,

            tamanhos:
              aggregates.tamanhos,

            estoquePorTamanho:
              aggregates.estoquePorTamanho,

            cores:
              aggregates.cores,

            estoquePorCor:
              aggregates.estoquePorCor,

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
