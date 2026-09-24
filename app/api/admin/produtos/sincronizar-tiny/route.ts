import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OlistOAuthError,
  getOlistV3,
  redisDelete,
  redisGetJson,
  redisSetJson,
  redisSetNx,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const SYNC_LOCK_KEY = "jkfashion:olist:v3:sync:lock";

// v21 = nova estrutura de leitura das variações.
// Trocar a versão força a reconstrução do cache do catálogo.
const TINY_CATALOG_CACHE_KEY =
  "jkfashion:olist:v3:catalog:canonical:v21";

const TINY_CATALOG_CACHE_TTL = 6 * 60 * 60;

const SITE_TINY_MAP_PREFIX = "jkfashion:olist:v3:site-tiny:";

// Janela usada apenas para descobrir produtos novos no modo rápido.
// Não controla a atualização de estoque dos produtos já cadastrados.
const QUICK_NEW_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const API_READ_BATCH_SIZE = 4;
const DETAIL_CONCURRENCY = 2;
const STOCK_CONFIRM_MAX_RETRIES = 1;
const FULL_BATCH_SIZE = 28;
const PLACEHOLDER_IMAGE = "";

type AnyRecord = Record<string, any>;

type TinyListItem = {
  id?: number;
  sku?: string | null;
  codigo?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  situacao?: string | null;
  dataCriacao?: string | null;
  dataAlteracao?: string | null;
  tipoVariacao?: string | null;

  produtoPai?: {
    id?: number | null;
  } | null;

  // Em algumas respostas da API a grade também pode vir no item da listagem.
  grade?: TinyGrade;
};

type TinyGrade =
  | Array<{
      chave?: string | null;
      valor?: string | null;
    }>
  | Record<string, unknown>
  | null
  | undefined;

type TinyVariation = {
  id?: number;

  descricao?: string | null;

  sku?: string | null;

  gtin?: string | null;

  estoque?: {
    quantidade?: number | null;
  } | null;

  grade?: TinyGrade;
};

type TinyDetail = {
  id?: number | null;

  sku?: string | null;

  descricao?: string | null;

  tipo?: string | null;

  descricaoComplementar?: string | null;

  situacao?: string | null;

  categoria?: {
    id?: number | null;
    nome?: string | null;
  } | null;

  precos?: {
    preco?: number | null;
    precoPromocional?: number | null;
  } | null;

  estoque?: {
    controlar?: boolean | null;
    quantidade?: number | null;
  } | null;

  anexos?: Array<{
    id?: number;
    url?: string;
    externo?: boolean;
  }> | null;

  variacoes?: any[] | null;

  variations?: any[] | null;

  produto?: {
    variacoes?: any[] | null;
    variations?: any[] | null;
  } | null;

  tipoVariacao?: string | null;

  produtoPai?: {
    id?: number | null;
    sku?: string | null;
  } | null;
};

type TinyListResponse = {
  itens?: TinyListItem[];

  paginacao?: {
    limit?: number;
    offset?: number;
    total?: number;
  };
};

type TinyStockResponse = {
  id?: number | null;

  nome?: string | null;

  codigo?: string | null;

  saldo?: number | null;

  reservado?: number | null;

  disponivel?: number | null;

  depositos?: Array<{
    saldo?: number | null;
    reservado?: number | null;
    disponivel?: number | null;
  }> | null;
};

type StockAggregate = {
  estoque: number;

  tamanhos: string[];

  cores: string[];

  estoquePorTamanho: Record<string, number>;

  estoquePorCor: Record<string, any>;

  variationCount: number;

  matrixComplete: boolean;
};

type VariationAttributes = {
  tamanhos: string[];

  cores: string[];
};

type SiteSyncEntry = {
  siteId: string | null;

  tinyId: string;

  nomeSite?: string;

  nomeTiny?: string;

  isNew?: boolean;

  matchMethod?: "redis" | "id" | "nome" | "similaridade" | "novo";
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

function safeNonNegativeInt(value: unknown): number | null {
  const n = num(value);

  if (n == null || n < 0) {
    return null;
  }

  return Math.round(n);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeName(value: string): string[] {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 2);
}

function nameSimilarity(a: string, b: string): number {
  const aa = new Set(tokenizeName(a));
  const bb = new Set(tokenizeName(b));

  if (aa.size === 0 || bb.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of aa) {
    if (bb.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...aa, ...bb]).size;

  const jaccard = union ? intersection / union : 0;

  const na = normalize(a);
  const nb = normalize(b);

  const containsBonus =
    na.includes(nb) || nb.includes(na)
      ? 0.15
      : 0;

  return Math.min(1, jaccard + containsBonus);
}

async function getStoredTinyId(
  siteId: string
): Promise<string | null> {
  return redisGetJson<string>(
    `${SITE_TINY_MAP_PREFIX}${siteId}`
  ).catch(() => null);
}

async function setStoredTinyId(
  siteId: string,
  tinyId: string
): Promise<void> {
  await redisSetJson(
    `${SITE_TINY_MAP_PREFIX}${siteId}`,
    tinyId,
    365 * 24 * 60 * 60
  ).catch(() => undefined);
}

function sortSizes(values: string[]): string[] {
  const order = new Map<string, number>([
    ["pp", 1],
    ["p", 2],
    ["m", 3],
    ["g", 4],
    ["gg", 5],
    ["xg", 6],
    ["xxg", 7],
  ]);

  return [...new Set(values)].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);

    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return na - nb;
    }

    const oa = order.get(normalize(a));
    const ob = order.get(normalize(b));

    if (oa != null && ob != null) {
      return oa - ob;
    }

    if (oa != null) {
      return -1;
    }

    if (ob != null) {
      return 1;
    }

    return a.localeCompare(b, "pt-BR", {
      numeric: true,
    });
  });
}

function getVariationObject(rawVariation: any): any {
  if (
    rawVariation &&
    typeof rawVariation === "object"
  ) {
    return (
      rawVariation.variacao ||
      rawVariation.variation ||
      rawVariation
    );
  }

  return rawVariation;
}

function getRawVariationsFromDetail(
  detail: TinyDetail
): any[] {
  const candidates = [
    (detail as any)?.variacoes,
    (detail as any)?.variations,
    (detail as any)?.produto?.variacoes,
    (detail as any)?.produto?.variations,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

/**
 * =============================================================
 * INTERPRETAÇÃO DA GRADE DO TINY / OLIST
 * =============================================================
 *
 * REGRA:
 *
 * - somente uma característica cujo nome seja de tamanho
 *   será enviada para "tamanho";
 *
 * - qualquer outra característica encontrada será tratada
 *   como "cor".
 *
 * Exemplos:
 *
 * Tamanho + Modelo
 *   10 + CORAÇÃO
 *   10 + PRETTY
 *
 * vira:
 *
 * tamanho = 10
 * cor = CORAÇÃO
 *
 *
 * Tamanho + Estampa
 *   M + FLORAL
 *
 * vira:
 *
 * tamanho = M
 * cor = FLORAL
 *
 *
 * Tamanho + Modelo + Estampa
 *   10 + CORAÇÃO + ROSA
 *
 * vira:
 *
 * tamanho = 10
 * cor = CORAÇÃO / ROSA
 *
 * Portanto o site não precisa conhecer os nomes das grades
 * utilizadas no Tiny.
 */
function parseGrade(
  grade: TinyGrade,
  descricao: string,
  knownSizes: string[] = [],
  knownColors: string[] = []
): {
  tamanho: string;
  cor: string;
} {
  let tamanho = "";

  // Todas as características diferentes de tamanho
  // serão armazenadas aqui.
  const corValues: string[] = [];

  const knownSizeMap = new Map(
    knownSizes.map((v) => [
      normalize(v),
      v,
    ])
  );

  const knownColorMap = new Map(
    knownColors.map((v) => [
      normalize(v),
      v,
    ])
  );

  /**
   * Adiciona uma opção de variação na coleção de "cores".
   */
  const addCor = (valueRaw: unknown) => {
    const value = str(valueRaw);

    if (!value) {
      return;
    }

    const normalizedValue = normalize(value);

    // Preserva a grafia que já existe no site,
    // quando o valor já estiver cadastrado.
    const knownColor =
      knownColorMap.get(normalizedValue);

    const finalValue =
      knownColor || value;

    if (
      finalValue &&
      !corValues.some(
        (existing) =>
          normalize(existing) ===
          normalize(finalValue)
      )
    ) {
      corValues.push(finalValue);
    }
  };

  /**
   * Lê uma chave/valor da grade.
   */
  const inspect = (
    keyRaw: unknown,
    valueRaw: unknown
  ) => {
    const key = normalize(str(keyRaw));
    const value = str(valueRaw);

    if (!value) {
      return;
    }

    // =========================================================
    // TAMANHO
    // =========================================================
    //
    // Só reconhecemos como tamanho quando a chave da grade
    // realmente indica tamanho.
    //
    // Tamanho
    // Tam
    // Size
    //
    // Todo o resto é tratado como variação/cor.
    //
    const isSizeKey =
      key.includes("tamanho") ||
      key === "tam" ||
      key.includes("size");

    if (isSizeKey) {
      tamanho = value;
      return;
    }

    // =========================================================
    // QUALQUER OUTRA VARIAÇÃO
    // =========================================================
    //
    // Não importa o nome:
    //
    // Cor
    // Modelo
    // Estampa
    // Tema
    // Personagem
    // Material
    // Voltagem
    // Coleção
    // Versão
    // etc.
    //
    // Tudo será armazenado no campo "cores".
    //
    addCor(value);
  };

  // ===========================================================
  // GRADE EM ARRAY
  // ===========================================================
  //
  // Exemplo:
  //
  // [
  //   { chave: "Tamanho", valor: "10" },
  //   { chave: "Modelo", valor: "CORAÇÃO" }
  // ]
  //
  if (Array.isArray(grade)) {
    for (const item of grade) {
      inspect(
        item?.chave,
        item?.valor
      );
    }
  }

  // ===========================================================
  // GRADE EM OBJETO
  // ===========================================================
  //
  // Exemplo:
  //
  // {
  //   Tamanho: "10",
  //   Modelo: "CORAÇÃO"
  // }
  //
  else if (
    grade &&
    typeof grade === "object"
  ) {
    const gradeObj =
      grade as Record<string, unknown>;

    // Também aceita:
    //
    // {
    //   chave: "Tamanho",
    //   valor: "10"
    // }
    //
    if (
      "chave" in gradeObj &&
      "valor" in gradeObj
    ) {
      inspect(
        gradeObj.chave,
        gradeObj.valor
      );
    }

    for (const [key, value] of Object.entries(
      gradeObj
    )) {
      if (
        key === "chave" ||
        key === "valor"
      ) {
        continue;
      }

      // Exemplo:
      //
      // {
      //   Tamanho: {
      //     valor: "10"
      //   }
      // }
      //
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const nested =
          value as Record<string, unknown>;

        if ("valor" in nested) {
          inspect(
            key,
            nested.valor
          );

          continue;
        }
      }

      inspect(key, value);
    }
  }

  // ===========================================================
  // FALLBACK PELA DESCRIÇÃO
  // ===========================================================
  //
  // Caso a grade não tenha vindo estruturada,
  // tentamos interpretar a descrição.
  //
  // Exemplos:
  //
  // "10 | CORAÇÃO"
  // "10 | PRETTY"
  // "Produto - 10 - CORAÇÃO"
  //
  if (
    !tamanho ||
    corValues.length === 0
  ) {
    const parts = descricao
      .split(
        /\s+-\s+|\s*\|\s*|\s+\/\s+/
      )
      .map((part) => part.trim())
      .filter(Boolean);

    // ---------------------------------------------------------
    // Tenta encontrar um tamanho conhecido.
    // ---------------------------------------------------------
    if (!tamanho) {
      for (const part of parts) {
        const normalizedPart =
          normalize(part);

        // Primeiro verifica se o site já conhece
        // esse tamanho.
        if (
          knownSizeMap.has(
            normalizedPart
          )
        ) {
          tamanho =
            knownSizeMap.get(
              normalizedPart
            )!;

          break;
        }

        // Depois verifica os formatos de tamanho
        // mais comuns.
        if (
          /^(rn|pp|p|m|g|gg|xg|xxg|xgg|eg|egg|exg|\d{1,2})$/i.test(
            normalizedPart
          )
        ) {
          tamanho = part;
          break;
        }
      }
    }

    // ---------------------------------------------------------
    // Tudo que não for o tamanho vira "cor".
    // ---------------------------------------------------------
    if (
      corValues.length === 0 &&
      parts.length > 0
    ) {
      const normalizedTamanho =
        normalize(tamanho);

      for (const part of parts) {
        if (
          tamanho &&
          normalize(part) ===
            normalizedTamanho
        ) {
          continue;
        }

        addCor(part);
      }
    }
  }

  // ===========================================================
  // ÚLTIMO FALLBACK
  // ===========================================================
  //
  // Proteção para formatos como:
  //
  // Produto - 10 - CORAÇÃO
  //
  // Produto - CORAÇÃO - 10
  //
  if (
    (!tamanho ||
      corValues.length === 0) &&
    descricao
  ) {
    const parts = descricao
      .split(
        /\s+-\s+|\s*\|\s*|\s+\/\s+/
      )
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const candidates =
        [...parts].reverse();

      for (const candidate of candidates) {
        const normalizedCandidate =
          normalize(candidate);

        const isSize =
          knownSizeMap.has(
            normalizedCandidate
          ) ||
          /^(rn|pp|p|m|g|gg|xg|xxg|xgg|eg|egg|exg|\d{1,2})$/i.test(
            normalizedCandidate
          );

        if (!tamanho && isSize) {
          tamanho =
            knownSizeMap.get(
              normalizedCandidate
            ) || candidate;

          continue;
        }

        if (!isSize) {
          addCor(candidate);
        }

        if (
          tamanho &&
          corValues.length > 0
        ) {
          break;
        }
      }
    }
  }

  // ===========================================================
  // Resultado final
  // ===========================================================
  //
  // Se houver uma única variação:
  //
  // CORAÇÃO
  //
  // retorna:
  //
  // cor = "CORAÇÃO"
  //
  // Se houver mais de uma:
  //
  // CORAÇÃO
  // ROSA
  //
  // retorna:
  //
  // cor = "CORAÇÃO / ROSA"
  //
  const cor = [
    ...new Set(
      corValues
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].join(" / ");

  return {
    tamanho: tamanho.trim(),
    cor,
  };
}

/**
 * Extrai somente as opções de variação
 * (tamanhos e "cores") de TODAS as variações
 * conhecidas do produto.
 *
 * Esta rotina é separada da lógica de estoque.
 */
function extractVariationAttributes(
  detail: TinyDetail,
  variationHeaders: TinyListItem[] = [],
  knownSizes: string[] = [],
  knownColors: string[] = []
): VariationAttributes {
  const sizes = new Set<string>();
  const colors = new Set<string>();

  const consume = (
    grade: TinyGrade,
    descricao: unknown
  ) => {
    const parsed = parseGrade(
      grade,
      str(descricao),
      knownSizes,
      knownColors
    );

    if (parsed.tamanho) {
      sizes.add(
        parsed.tamanho.trim()
      );
    }

    if (parsed.cor) {
      colors.add(
        parsed.cor.trim()
      );
    }
  };

  // ===========================================================
  // Variações retornadas dentro do detalhe do produto pai.
  // ===========================================================
  for (
    const rawVariation of
    getRawVariationsFromDetail(detail)
  ) {
    const variation =
      getVariationObject(
        rawVariation
      );

    consume(
      variation?.grade,
      str(
        variation?.descricao
      ) ||
        str(variation?.nome) ||
        str(variation?.titulo)
    );
  }

  // ===========================================================
  // Variações da listagem geral.
  // ===========================================================
  for (
    const rawVariation of variationHeaders
  ) {
    const variation =
      getVariationObject(
        rawVariation
      );

    consume(
      variation?.grade,
      str(
        variation?.descricao
      ) ||
        str(variation?.nome) ||
        str(variation?.titulo)
    );
  }

  return {
    tamanhos: sortSizes([
      ...sizes,
    ]),

    cores: [
      ...colors,
    ].sort(
      (a, b) =>
        a.localeCompare(
          b,
          "pt-BR",
          {
            sensitivity: "base",
          }
        )
    ),
  };
}

function buildVariationHeadersByParent(
  tinyHeaders: TinyListItem[]
): Map<
  string,
  TinyListItem[]
> {
  const result =
    new Map<
      string,
      TinyListItem[]
    >();

  for (const item of tinyHeaders) {
    const tipoVariacao =
      normalize(
        str(
          item.tipoVariacao
        )
      );

    if (tipoVariacao !== "v") {
      continue;
    }

    const parentId = str(
      item.produtoPai?.id
    );

    const variationId =
      canonicalId(item);

    if (
      !parentId ||
      !variationId
    ) {
      continue;
    }

    const current =
      result.get(parentId) || [];

    if (
      !current.some(
        (existing) =>
          canonicalId(existing) ===
          variationId
      )
    ) {
      current.push(item);
    }

    result.set(
      parentId,
      current
    );
  }

  return result;
}

function aggregateDetail(
  detail: TinyDetail,
  knownSizes: string[] = [],
  knownColors: string[] = []
): StockAggregate | null {
  const variations =
    Array.isArray(
      detail.variacoes
    )
      ? detail.variacoes
      : [];

  // ===========================================================
  // PRODUTO SEM VARIAÇÕES
  // ===========================================================
  if (variations.length === 0) {
    const qty =
      safeNonNegativeInt(
        detail.estoque?.quantidade
      );

    if (qty == null) {
      return null;
    }

    return {
      estoque: qty,

      tamanhos: [],

      cores: [],

      estoquePorTamanho: {},

      estoquePorCor: {},

      variationCount: 0,

      matrixComplete: true,
    };
  }

  let totalVariacoes = 0;

  let todasQuantidadesValidas =
    true;

  let todosGradesReconhecidos =
    true;

  const sizes =
    new Set<string>();

  const colors =
    new Set<string>();

  const bySize =
    new Map<string, number>();

  const matrixByColor:
    Record<
      string,
      Record<string, number>
    > = {};

  const colorTotals =
    new Map<string, number>();

  for (const variation of variations) {
    const qty =
      safeNonNegativeInt(
        variation.estoque
          ?.quantidade
      );

    if (qty == null) {
      todasQuantidadesValidas =
        false;

      continue;
    }

    totalVariacoes += qty;

    const grade =
      parseGrade(
        variation.grade,
        str(
          variation.descricao
        ),
        knownSizes,
        knownColors
      );

    // Se não conseguiu reconhecer absolutamente
    // nenhuma característica da grade.
    if (
      !grade.tamanho &&
      !grade.cor
    ) {
      todosGradesReconhecidos =
        false;
    }

    // =========================================================
    // TAMANHO
    // =========================================================
    if (grade.tamanho) {
      sizes.add(
        grade.tamanho
      );

      bySize.set(
        grade.tamanho,
        (
          bySize.get(
            grade.tamanho
          ) || 0
        ) + qty
      );
    }

    // =========================================================
    // QUALQUER OUTRA VARIAÇÃO = COR
    // =========================================================
    if (grade.cor) {
      colors.add(
        grade.cor
      );

      colorTotals.set(
        grade.cor,
        (
          colorTotals.get(
            grade.cor
          ) || 0
        ) + qty
      );

      if (grade.tamanho) {
        matrixByColor[
          grade.cor
        ] ||= {};

        matrixByColor[
          grade.cor
        ][grade.tamanho] =
          qty;
      }
    }
  }

  // ===========================================================
  // ESTOQUE DO PRODUTO PAI
  // ===========================================================
  //
  // Mantida a lógica existente.
  //
  const parentQty =
    safeNonNegativeInt(
      detail.estoque?.quantidade
    );

  const estoqueTotal =
    parentQty != null &&
    parentQty > 0
      ? parentQty
      : todasQuantidadesValidas
        ? totalVariacoes
        : parentQty;

  if (estoqueTotal == null) {
    return null;
  }

  const tamanhos =
    sortSizes([
      ...sizes,
    ]);

  const cores =
    [
      ...colors,
    ].sort(
      (a, b) =>
        a.localeCompare(
          b,
          "pt-BR"
        )
    );

  let estoquePorCor:
    Record<string, any> = {};

  // ===========================================================
  // MATRIZ TAMANHO X COR
  // ===========================================================
  if (
    cores.length > 0 &&
    tamanhos.length > 0
  ) {
    for (const cor of cores) {
      estoquePorCor[cor] =
        matrixByColor[cor] ||
        {
          total:
            colorTotals.get(
              cor
            ) || 0,
        };
    }
  } else {
    estoquePorCor =
      Object.fromEntries(
        cores.map((cor) => [
          cor,
          colorTotals.get(
            cor
          ) || 0,
        ])
      );
  }

  // ===========================================================
  // MATRIZ COMPLETA
  // ===========================================================
  //
  // Só substitui a matriz quando:
  //
  // - todas as quantidades são válidas;
  // - conseguimos reconhecer a grade.
  //
  const matrixComplete =
    todasQuantidadesValidas &&
    todosGradesReconhecidos;

  return {
    estoque: estoqueTotal,

    tamanhos,

    cores,

    estoquePorTamanho:
      Object.fromEntries(
        tamanhos.map(
          (size) => [
            size,
            bySize.get(size) ||
              0,
          ]
        )
      ),

    estoquePorCor,

    variationCount:
      variations.length,

    matrixComplete,
  };
}

function imageUrls(
  detail: TinyDetail
): string[] {
  return [
    ...new Set(
      (detail.anexos || [])
        .map((item) =>
          str(item?.url)
        )
        .filter((url) =>
          /^https?:\/\//i.test(
            url
          )
        )
    ),
  ];
}

function canonicalId(
  item: TinyListItem
): string | null {
  const id =
    Number(item.id || 0);

  if (
    !Number.isFinite(id) ||
    id <= 0
  ) {
    return null;
  }

  return String(id);
}

async function listProducts(
  params: Record<string, string>
): Promise<TinyListResponse> {
  const query =
    new URLSearchParams(params);

  return getOlistV3<TinyListResponse>(
    `/produtos?${query.toString()}`
  );
}

async function listAllProductHeaders(): Promise<
  TinyListItem[]
> {
  const all: TinyListItem[] = [];

  const limit = 100;

  let offset = 0;

  for (;;) {
    const data =
      await listProducts({
        limit: String(limit),
        offset: String(offset),
      });

    const items =
      Array.isArray(data.itens)
        ? data.itens
        : [];

    all.push(...items);

    const total =
      Number(
        data.paginacao?.total ||
          0
      );

    if (
      items.length === 0 ||
      items.length < limit ||
      offset + items.length >=
        total
    ) {
      break;
    }

    offset += items.length;
  }

  return all;
}

async function listAllActiveProductHeaders(): Promise<
  TinyListItem[]
> {
  const all: TinyListItem[] = [];

  const limit = 100;

  let offset = 0;

  for (;;) {
    const data =
      await listProducts({
        limit: String(limit),
        offset: String(offset),
        situacao: "A",
      });

    const items =
      Array.isArray(data.itens)
        ? data.itens
        : [];

    all.push(...items);

    const total =
      Number(
        data.paginacao?.total ||
          0
      );

    if (
      items.length === 0 ||
      items.length < limit ||
      offset + items.length >=
        total
    ) {
      break;
    }

    offset += items.length;
  }

  return all;
}

function uniqueCanonicalHeaders(
  items: TinyListItem[]
): TinyListItem[] {
  const seen =
    new Set<string>();

  const result:
    TinyListItem[] = [];

  for (const item of items) {
    const tipoVariacao =
      normalize(
        str(
          item.tipoVariacao
        )
      );

    if (
      tipoVariacao === "v"
    ) {
      continue;
    }

    const id =
      canonicalId(item);

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    result.push(item);
  }

  return result;
}

function sinceDateString(
  timestamp: number
): string {
  const d =
    new Date(timestamp);

  const pad = (v: number) =>
    String(v).padStart(
      2,
      "0"
    );

  return (
    `${d.getFullYear()}-${pad(
      d.getMonth() + 1
    )}-${pad(
      d.getDate()
    )} ${pad(
      d.getHours()
    )}:${pad(
      d.getMinutes()
    )}:${pad(
      d.getSeconds()
    )}`
  );
}

async function getDetail(
  id: string
): Promise<TinyDetail> {
  return getOlistV3<TinyDetail>(
    `/produtos/${encodeURIComponent(
      id
    )}`
  );
}

async function getConfirmedStock(
  id: string
): Promise<number> {
  let lastError: unknown =
    null;

  for (
    let attempt = 0;
    attempt <=
      STOCK_CONFIRM_MAX_RETRIES;
    attempt++
  ) {
    try {
      const data =
        await getOlistV3<TinyStockResponse>(
          `/estoque/${encodeURIComponent(
            id
          )}`
        );

      const saldo =
        safeNonNegativeInt(
          data?.saldo
        );

      if (saldo == null) {
        throw new Error(
          `Olist/Tiny não retornou um saldo válido para ${id}.`
        );
      }

      return saldo;
    } catch (error) {
      lastError = error;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const is429 =
        /API 429|HTTP 429|rate limit/i.test(
          message
        );

      if (
        !is429 ||
        attempt >=
          STOCK_CONFIRM_MAX_RETRIES
      ) {
        break;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            1200
          )
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `Não foi possível confirmar o estoque do produto Tiny ${id}.`
      );
}

async function mapWithConcurrency<
  T,
  R
>(
  items: T[],
  concurrency: number,
  fn: (
    item: T,
    index: number
  ) => Promise<R>
): Promise<R[]> {
  const results =
    new Array<R>(
      items.length
    );

  let nextIndex = 0;

  const worker =
    async () => {
      for (;;) {
        const index =
          nextIndex++;

        if (
          index >=
          items.length
        ) {
          return;
        }

        results[index] =
          await fn(
            items[index],
            index
          );
      }
    };

  const workers =
    Array.from(
      {
        length: Math.max(
          1,
          Math.min(
            concurrency,
            items.length
          )
        ),
      },
      () => worker()
    );

  await Promise.all(
    workers
  );

  return results;
}

async function updateExistingProduct(
  id: string,
  detail: TinyDetail,
  variationAttributes?: VariationAttributes
): Promise<{
  updated: boolean;

  changed: boolean;

  siteStockBefore: number | null;

  tinyStock: number;

  variationCount: number;

  stockSource:
    | "product"
    | "variations"
    | "confirmed-stock";

  confirmed: boolean;

  matrixComplete: boolean;
}> {
  const existing =
    await prisma.produto.findUnique(
      {
        where: { id },

        select: {
          id: true,

          estoque: true,

          tamanhos: true,

          cores: true,

          estoquePorTamanho: true,

          estoquePorCor: true,
        },
      }
    );

  if (!existing) {
    return {
      updated: false,

      changed: false,

      siteStockBefore: null,

      tinyStock: 0,

      variationCount: 0,

      stockSource: "product",

      confirmed: false,

      matrixComplete: false,
    };
  }

  const aggregate =
    aggregateDetail(
      detail,
      existing.tamanhos ||
        [],
      existing.cores ||
        []
    );

  if (!aggregate) {
    throw new Error(
      `Estoque inválido ou ausente no produto Tiny ${id}. Produto preservado no site.`
    );
  }

  const hasVariations =
    aggregate.variationCount >
    0;

  let tinyStock =
    aggregate.estoque;

  let stockSource:
    | "product"
    | "variations"
    | "confirmed-stock" =
    hasVariations
      ? (
          safeNonNegativeInt(
            detail.estoque
              ?.quantidade
          ) != null &&
          (
            safeNonNegativeInt(
              detail.estoque
                ?.quantidade
            ) || 0
          ) > 0
            ? "product"
            : "variations"
        )
      : "product";

  let confirmed = false;

  // ===========================================================
  // REGRA DE ESTOQUE
  // ===========================================================
  //
  // Mantida exatamente como estava.
  //
  if (
    !hasVariations &&
    tinyStock === 0 &&
    Number(existing.estoque || 0) >
      0
  ) {
    tinyStock =
      await getConfirmedStock(
        id
      );

    stockSource =
      "confirmed-stock";

    confirmed = true;
  }

  const data:
    Record<
      string,
      unknown
    > = {
      estoque: tinyStock,
    };

  // ===========================================================
  // ATUALIZA AS OPÇÕES DE VARIAÇÃO
  // ===========================================================
  //
  // Tamanhos continuam em "tamanhos".
  //
  // Qualquer outra variação vai para "cores".
  //
  if (variationAttributes) {
    if (
      variationAttributes
        .tamanhos.length > 0
    ) {
      data.tamanhos =
        variationAttributes.tamanhos;
    }

    if (
      variationAttributes
        .cores.length > 0
    ) {
      data.cores =
        variationAttributes.cores;
    }
  }

  // ===========================================================
  // ESTOQUE POR VARIAÇÃO
  // ===========================================================
  //
  // Mantém a lógica existente.
  //
  if (
    aggregate.matrixComplete
  ) {
    data.estoquePorTamanho =
      aggregate.estoquePorTamanho;

    data.estoquePorCor =
      aggregate.estoquePorCor;
  }

  await prisma.produto.update(
    {
      where: { id },

      data,
    }
  );

  return {
    updated: true,

    changed:
      existing.estoque !==
      tinyStock,

    siteStockBefore:
      existing.estoque,

    tinyStock,

    variationCount:
      aggregate.variationCount,

    stockSource,

    confirmed,

    matrixComplete:
      aggregate.matrixComplete,
  };
}

async function createNewProduct(
  id: string,
  detail: TinyDetail,
  variationAttributes?: VariationAttributes
): Promise<{
  created: boolean;
  variationCount: number;
}> {
  const existing =
    await prisma.produto.findUnique(
      {
        where: { id },

        select: {
          id: true,
        },
      }
    );

  if (existing) {
    return {
      created: false,

      variationCount: 0,
    };
  }

  const aggregate =
    aggregateDetail(detail);

  if (!aggregate) {
    throw new Error(
      `Estoque inválido ou ausente no novo produto Tiny ${id}. Produto não foi cadastrado.`
    );
  }

  const descricao =
    str(
      detail.descricaoComplementar
    ) ||
    str(detail.descricao) ||
    `Produto ${id}`;

  const nome =
    str(detail.descricao) ||
    `Produto ${id}`;

  const imagens =
    imageUrls(detail);

  const preco =
    num(
      detail.precos?.preco
    ) ?? 0;

  const promocional =
    num(
      detail.precos
        ?.precoPromocional
    );

  await prisma.produto.create(
    {
      data: {
        id,

        nome,

        descricao,

        preco,

        precoPromocional:
          promocional != null &&
          promocional > 0
            ? promocional
            : null,

        imagemUrl:
          imagens[0] ||
          PLACEHOLDER_IMAGE,

        imagens,

        estoque:
          aggregate.estoque,

        // Estoque continua vindo
        // do aggregate atual.
        estoquePorTamanho:
          aggregate.estoquePorTamanho,

        estoquePorCor:
          aggregate.estoquePorCor,

        // =====================================================
        // VARIAÇÕES
        // =====================================================
        //
        // Tamanho -> tamanhos
        //
        // Qualquer outra característica
        // -> cores
        //
        tamanhos:
          variationAttributes
            ?.tamanhos?.length
            ? variationAttributes.tamanhos
            : aggregate.tamanhos,

        cores:
          variationAttributes
            ?.cores?.length
            ? variationAttributes.cores
            : aggregate.cores,

        coresDetalhes:
          undefined,

        genero:
          null,

        faixaEtaria:
          null,

        ativo:
          str(
            detail.situacao
          ).toUpperCase() ===
          "A",

        categoriaNome:
          null,
      },
    }
  );

  return {
    created: true,

    variationCount:
      aggregate.variationCount,
  };
}

async function withSyncLock<T>(
  fn: () => Promise<T>
): Promise<T> {
  const owner =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const locked =
    await redisSetNx(
      SYNC_LOCK_KEY,
      owner,
      120
    );

  if (!locked) {
    throw new Error(
      "Já existe uma sincronização do Tiny em andamento. Aguarde terminar."
    );
  }

  try {
    return await fn();
  } finally {
    await redisDelete(
      SYNC_LOCK_KEY
    ).catch(
      () => undefined
    );
  }
}

async function buildTinyCanonicalMap() {
  const cached =
    await redisGetJson<{
      tinyHeaders: TinyListItem[];

      cachedAt?: number;
    }>(
      TINY_CATALOG_CACHE_KEY
    ).catch(
      () => null
    );

  if (
    cached &&
    Array.isArray(
      cached.tinyHeaders
    ) &&
    cached.tinyHeaders.length >
      0
  ) {
    const canonical =
      uniqueCanonicalHeaders(
        cached.tinyHeaders
      );

    return buildCanonicalMaps(
      cached.tinyHeaders,
      canonical
    );
  }

  const tinyHeaders =
    await listAllActiveProductHeaders();

  const canonical =
    uniqueCanonicalHeaders(
      tinyHeaders
    );

  await redisSetJson(
    TINY_CATALOG_CACHE_KEY,
    {
      tinyHeaders,

      cachedAt:
        Date.now(),
    },

    TINY_CATALOG_CACHE_TTL
  ).catch(
    (error) => {
      console.warn(
        "[Olist V3] Não foi possível salvar cache do catálogo:",
        error
      );
    }
  );

  return buildCanonicalMaps(
    tinyHeaders,
    canonical
  );
}

function buildCanonicalMaps(
  tinyHeaders: TinyListItem[],
  canonical: TinyListItem[]
) {
  const byId =
    new Map<
      string,
      TinyListItem
    >();

  const byName =
    new Map<
      string,
      TinyListItem[]
    >();

  for (const item of canonical) {
    const id =
      canonicalId(item);

    if (!id) {
      continue;
    }

    byId.set(
      id,
      item
    );

    const name =
      normalize(
        str(
          item.descricao
        )
      );

    if (!name) {
      continue;
    }

    const arr =
      byName.get(name) ||
      [];

    arr.push(item);

    byName.set(
      name,
      arr
    );
  }

  return {
    tinyHeaders,

    canonical,

    byId,

    byName,
  };
}

async function matchSiteProduct(
  site: {
    id: string;
    nome: string;
  },

  maps: Awaited<
    ReturnType<
      typeof buildTinyCanonicalMap
    >
  >
): Promise<{
  tinyId: string;

  tinyItem: TinyListItem;

  method:
    | "redis"
    | "id"
    | "nome"
    | "similaridade";
} | null> {
  // ===========================================================
  // Primeiro tenta associação salva.
  // ===========================================================
  const storedTinyId =
    await getStoredTinyId(
      site.id
    );

  if (storedTinyId) {
    const storedItem =
      maps.byId.get(
        storedTinyId
      );

    if (storedItem) {
      return {
        tinyId: storedTinyId,

        tinyItem: storedItem,

        method: "redis",
      };
    }
  }

  // ===========================================================
  // Depois tenta pelo próprio ID.
  // ===========================================================
  const direct =
    maps.byId.get(
      site.id
    );

  if (direct) {
    const tinyId =
      String(site.id);

    await setStoredTinyId(
      site.id,
      tinyId
    );

    return {
      tinyId,

      tinyItem: direct,

      method: "id",
    };
  }

  // ===========================================================
  // Depois tenta nome exato.
  // ===========================================================
  const name =
    normalize(
      site.nome
    );

  if (!name) {
    return null;
  }

  const exactCandidates =
    maps.byName.get(
      name
    ) || [];

  if (
    exactCandidates.length ===
    1
  ) {
    const tinyId =
      canonicalId(
        exactCandidates[0]
      );

    if (tinyId) {
      await setStoredTinyId(
        site.id,
        tinyId
      );

      return {
        tinyId,

        tinyItem:
          exactCandidates[0],

        method: "nome",
      };
    }
  }

  // ===========================================================
  // Fallback por similaridade.
  // ===========================================================
  let best:
    TinyListItem | null =
    null;

  let bestScore = 0;

  let secondScore = 0;

  for (
    const candidate of
    maps.canonical
  ) {
    const candidateName =
      str(
        candidate.descricao
      );

    if (!candidateName) {
      continue;
    }

    const score =
      nameSimilarity(
        site.nome,
        candidateName
      );

    if (
      score >
      bestScore
    ) {
      secondScore =
        bestScore;

      bestScore =
        score;

      best =
        candidate;
    } else if (
      score >
      secondScore
    ) {
      secondScore =
        score;
    }
  }

  if (
    best &&
    bestScore >= 0.72 &&
    bestScore -
      secondScore >= 0.08
  ) {
    const tinyId =
      canonicalId(best);

    if (tinyId) {
      await setStoredTinyId(
        site.id,
        tinyId
      );

      return {
        tinyId,

        tinyItem: best,

        method:
          "similaridade",
      };
    }
  }

  return null;
}

async function findNewTinyProducts(
  siteTinyIds: Set<string>
): Promise<SiteSyncEntry[]> {
  // Produtos novos são descobertos
  // através de uma janela recente.
  const since =
    new Date(
      Date.now() -
        QUICK_NEW_LOOKBACK_MS
    );

  const data =
    await listProducts({
      limit: "100",

      offset: "0",

      dataCriacao:
        sinceDateString(
          since.getTime()
        ),

      situacao: "A",
    });

  const headers =
    uniqueCanonicalHeaders(
      Array.isArray(
        data.itens
      )
        ? data.itens
        : []
    );

  const result:
    SiteSyncEntry[] = [];

  for (
    const item of headers
  ) {
    const tinyId =
      canonicalId(item);

    if (
      !tinyId ||
      siteTinyIds.has(
        tinyId
      )
    ) {
      continue;
    }

    result.push({
      siteId: null,

      tinyId,

      nomeTiny:
        str(
          item.descricao
        ),

      isNew: true,

      matchMethod: "novo",
    });
  }

  return result;
}

async function prepareQuick() {
  const siteProducts =
    await prisma.produto.findMany(
      {
        select: {
          id: true,

          nome: true,
        },
      }
    );

  const maps =
    await buildTinyCanonicalMap();

  const entries:
    SiteSyncEntry[] = [];

  const matchedTinyIds =
    new Set<string>();

  let unmatchedExisting = 0;

  let ambiguousExisting = 0;

  for (
    const site of siteProducts
  ) {
    const match =
      await matchSiteProduct(
        {
          id: String(
            site.id
          ),

          nome: String(
            site.nome || ""
          ),
        },

        maps
      );

    if (!match) {
      const name =
        normalize(
          String(
            site.nome ||
              ""
          )
        );

      const candidates =
        maps.byName.get(
          name
        ) || [];

      if (
        candidates.length >
        1
      ) {
        ambiguousExisting +=
          1;
      } else {
        unmatchedExisting +=
          1;
      }

      continue;
    }

    matchedTinyIds.add(
      match.tinyId
    );

    entries.push({
      siteId: String(
        site.id
      ),

      tinyId:
        match.tinyId,

      nomeSite:
        String(
          site.nome || ""
        ),

      nomeTiny:
        str(
          match.tinyItem
            .descricao
        ),

      isNew: false,

      matchMethod:
        match.method,
    });
  }

  const newEntries =
    await findNewTinyProducts(
      matchedTinyIds
    );

  const seen =
    new Set(
      entries.map(
        (entry) =>
          entry.tinyId
      )
    );

  for (
    const entry of newEntries
  ) {
    if (
      seen.has(
        entry.tinyId
      )
    ) {
      continue;
    }

    seen.add(
      entry.tinyId
    );

    entries.push(
      entry
    );
  }

  return {
    success: true,

    mode:
      "prepare-quick",

    entries,

    total:
      entries.length,

    existingCount:
      entries.filter(
        (entry) =>
          !entry.isNew
      ).length,

    newCount:
      entries.filter(
        (entry) =>
          entry.isNew
      ).length,

    unmatchedExisting,

    ambiguousExisting,

    batchSize:
      API_READ_BATCH_SIZE,

    catalogoConsultado:
      maps.tinyHeaders.length,

    variacoesDetectadasNoCatalogo:
      maps.tinyHeaders.filter(
        (item) =>
          normalize(
            str(
              item.tipoVariacao
            )
          ) === "v"
      ).length,
  };
}

async function stockBatch(
  entries: SiteSyncEntry[]
) {
  const cleanEntries =
    entries
      .filter(
        (entry) =>
          entry &&
          entry.tinyId
      )
      .slice(
        0,
        API_READ_BATCH_SIZE
      );

  if (
    cleanEntries.length ===
    0
  ) {
    return {
      success: true,

      mode:
        "stock-batch",

      criados: 0,

      atualizados: 0,

      ignorados: 0,

      falhas: 0,

      variacoesProcessadas: 0,

      processados: 0,
    };
  }

  return withSyncLock(
    async () => {
      let criados = 0;

      let atualizados = 0;

      let ignorados = 0;

      let falhas = 0;

      let variacoesProcessadas =
        0;

      let estoqueAlterado = 0;

      let produtosComVariacoesSincronizadas =
        0;

      let variacoesDetectadasNaListagem =
        0;

      const diagnosticos:
        Array<
          Record<
            string,
            unknown
          >
        > = [];

      // =======================================================
      // Catálogo
      // =======================================================
      const maps =
        await buildTinyCanonicalMap();

      // =======================================================
      // Índice:
      //
      // produto pai -> todas as variações V
      // =======================================================
      const variationHeadersByParent =
        buildVariationHeadersByParent(
          maps.tinyHeaders
        );

      type BatchResult = {
        kind:
          | "created"
          | "updated"
          | "ignored"
          | "failed";

        variationCount: number;

        changed?: boolean;

        siteStockBefore?:
          number | null;

        tinyStock?: number;

        siteId?: string | null;

        tinyId?: string;

        nomeSite?: string;

        nomeTiny?: string;

        matchMethod?:
          SiteSyncEntry["matchMethod"];

        error?: string;

        rateLimited?: boolean;

        stockSource?:
          | "product"
          | "variations"
          | "confirmed-stock";

        confirmed?: boolean;

        variationOptions?:
          VariationAttributes;

        variationHeadersCount?: number;
      };

      const results =
        await mapWithConcurrency<
          SiteSyncEntry,
          BatchResult
        >(
          cleanEntries,

          DETAIL_CONCURRENCY,

          async (
            entry
          ): Promise<BatchResult> => {
            try {
              // =================================================
              // Busca detalhe completo do produto pai.
              // =================================================
              const detail =
                await getDetail(
                  entry.tinyId
                );

              // =================================================
              // Busca TODAS as variações V da listagem
              // pertencentes ao produto pai.
              // =================================================
              const variationHeaders =
                variationHeadersByParent.get(
                  entry.tinyId
                ) || [];

              let knownSizes:
                string[] = [];

              let knownColors:
                string[] = [];

              // =================================================
              // Pega os valores já existentes no site.
              // Isso ajuda a preservar a grafia dos valores.
              // =================================================
              if (entry.siteId) {
                const existingForVariation =
                  await prisma.produto.findUnique(
                    {
                      where: {
                        id: entry.siteId,
                      },

                      select: {
                        tamanhos:
                          true,

                        cores:
                          true,
                      },
                    }
                  );

                knownSizes =
                  existingForVariation
                    ?.tamanhos ||
                  [];

                knownColors =
                  existingForVariation
                    ?.cores ||
                  [];
              }

              // =================================================
              // Extrai as variações.
              //
              // TAMANHO -> tamanhos
              //
              // TODO O RESTO -> cores
              // =================================================
              const variationOptions =
                extractVariationAttributes(
                  detail,

                  variationHeaders,

                  knownSizes,

                  knownColors
                );

              if (
                variationOptions
                  .tamanhos
                  .length > 0 ||
                variationOptions
                  .cores
                  .length > 0
              ) {
                produtosComVariacoesSincronizadas +=
                  1;
              }

              variacoesDetectadasNaListagem +=
                variationHeaders.length;

              // =================================================
              // PRODUTO JÁ ASSOCIADO AO SITE
              // =================================================
              if (entry.siteId) {
                const existing =
                  await prisma.produto.findUnique(
                    {
                      where: {
                        id: entry.siteId,
                      },

                      select: {
                        id: true,
                      },
                    }
                  );

                // -----------------------------------------------
                // Associação existe, mas o produto do site sumiu.
                // -----------------------------------------------
                if (!existing) {
                  const result =
                    await createNewProduct(
                      entry.tinyId,

                      detail,

                      variationOptions
                    );

                  return {
                    kind:
                      result.created
                        ? "created"
                        : "ignored",

                    variationCount:
                      Math.max(
                        result.variationCount,

                        variationHeaders.length
                      ),

                    siteId:
                      entry.siteId,

                    tinyId:
                      entry.tinyId,

                    nomeSite:
                      entry.nomeSite,

                    nomeTiny:
                      entry.nomeTiny,

                    matchMethod:
                      entry.matchMethod,

                    variationOptions,

                    variationHeadersCount:
                      variationHeaders.length,
                  };
                }

                // -----------------------------------------------
                // Atualiza o produto existente.
                // -----------------------------------------------
                const result =
                  await updateExistingProduct(
                    entry.siteId,

                    detail,

                    variationOptions
                  );

                return {
                  kind:
                    result.updated
                      ? "updated"
                      : "ignored",

                  variationCount:
                    Math.max(
                      result.variationCount,

                      variationHeaders.length
                    ),

                  changed:
                    result.changed,

                  siteStockBefore:
                    result.siteStockBefore,

                  tinyStock:
                    result.tinyStock,

                  siteId:
                    entry.siteId,

                  tinyId:
                    entry.tinyId,

                  nomeSite:
                    entry.nomeSite,

                  nomeTiny:
                    entry.nomeTiny,

                  matchMethod:
                    entry.matchMethod,

                  stockSource:
                    result.stockSource,

                  confirmed:
                    result.confirmed,

                  variationOptions,

                  variationHeadersCount:
                    variationHeaders.length,
                };
              }

              // =================================================
              // PRODUTO NOVO
              // =================================================
              if (
                str(
                  detail.situacao
                ).toUpperCase() !==
                "E"
              ) {
                const result =
                  await createNewProduct(
                    entry.tinyId,

                    detail,

                    variationOptions
                  );

                return {
                  kind:
                    result.created
                      ? "created"
                      : "ignored",

                  variationCount:
                    Math.max(
                      result.variationCount,

                      variationHeaders.length
                    ),

                  siteId:
                    entry.siteId,

                  tinyId:
                    entry.tinyId,

                  nomeSite:
                    entry.nomeSite,

                  nomeTiny:
                    entry.nomeTiny,

                  matchMethod:
                    entry.matchMethod,

                  variationOptions,

                  variationHeadersCount:
                    variationHeaders.length,
                };
              }

              return {
                kind:
                  "ignored",

                variationCount:
                  variationHeaders.length,

                variationOptions,

                variationHeadersCount:
                  variationHeaders.length,
              };
            } catch (
              error
            ) {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : String(error);

              const rateLimited =
                /API 429|HTTP 429|rate limit/i.test(
                  errorMessage
                );

              console.warn(
                `[Olist V3] Falha no produto Tiny ${entry.tinyId}:`,
                errorMessage
              );

              return {
                kind:
                  "failed",

                variationCount:
                  0,

                siteId:
                  entry.siteId,

                tinyId:
                  entry.tinyId,

                nomeSite:
                  entry.nomeSite,

                nomeTiny:
                  entry.nomeTiny,

                matchMethod:
                  entry.matchMethod,

                error:
                  errorMessage,

                rateLimited,
              };
            }
          }
        );

      // =========================================================
      // Consolida resultados
      // =========================================================
      for (const result of results) {
        if (
          result.kind ===
          "created"
        ) {
          criados += 1;
        } else if (
          result.kind ===
          "updated"
        ) {
          atualizados += 1;
        } else if (
          result.kind ===
          "ignored"
        ) {
          ignorados += 1;
        } else {
          falhas += 1;
        }

        if (
          result.kind ===
            "updated" &&
          result.changed
        ) {
          estoqueAlterado +=
            1;
        }

        if (result.tinyId) {
          diagnosticos.push(
            {
              siteId:
                result.siteId,

              tinyId:
                result.tinyId,

              nomeSite:
                result.nomeSite,

              nomeTiny:
                result.nomeTiny,

              matchMethod:
                result.matchMethod,

              siteStockBefore:
                result.siteStockBefore,

              tinyStock:
                result.tinyStock,

              estoqueMudou:
                Boolean(
                  result.changed
                ),

              stockSource:
                result.stockSource,

              confirmado:
                Boolean(
                  result.confirmed
                ),

              variacoesDaListagem:
                result.variationHeadersCount ||
                0,

              tamanhosSincronizados:
                result
                  .variationOptions
                  ?.tamanhos ||
                [],

              coresSincronizadas:
                result
                  .variationOptions
                  ?.cores ||
                [],

              erro:
                result.error,
            }
          );
        }

        variacoesProcessadas +=
          result.variationCount ||
          0;
      }

      // =========================================================
      // Produtos que falharam
      // =========================================================
      const failedEntries =
        results
          .filter(
            (result) =>
              result.kind ===
              "failed"
          )
          .map(
            (result) => ({
              siteId:
                result.siteId ||
                null,

              tinyId:
                result.tinyId ||
                "",

              nomeSite:
                result.nomeSite,

              nomeTiny:
                result.nomeTiny,

              isNew:
                false,

              matchMethod:
                result.matchMethod,

              error:
                result.error,
            })
          )
          .filter(
            (entry) =>
              Boolean(
                entry.tinyId
              )
          );

      const rateLimited =
        results.some(
          (result) =>
            result.rateLimited
        );

      return {
        success: true,

        mode:
          "stock-batch",

        criados,

        atualizados,

        ignorados,

        falhas,

        estoqueAlterado,

        variacoesProcessadas,

        produtosComVariacoesSincronizadas,

        variacoesDetectadasNaListagem,

        processados:
          results.filter(
            (result) =>
              result.kind !==
                "failed" ||
              !result.rateLimited
          ).length,

        rateLimited,

        retryAfterMs:
          rateLimited
            ? 65000
            : 0,

        failedEntries,

        diagnosticos,
      };
    }
  );
}

async function prepareFull() {
  const siteProducts =
    await prisma.produto.findMany(
      {
        select: {
          id: true,

          nome: true,
        },
      }
    );

  const maps =
    await buildTinyCanonicalMap();

  const entries:
    SiteSyncEntry[] = [];

  for (
    const site of siteProducts
  ) {
    const match =
      await matchSiteProduct(
        {
          id: String(
            site.id
          ),

          nome: String(
            site.nome || ""
          ),
        },

        maps
      );

    if (!match) {
      continue;
    }

    entries.push({
      siteId: String(
        site.id
      ),

      tinyId:
        match.tinyId,

      nomeSite:
        String(
          site.nome || ""
        ),

      nomeTiny:
        str(
          match.tinyItem
            .descricao
        ),

      isNew: false,

      matchMethod:
        match.method,
    });
  }

  return {
    success: true,

    mode:
      "prepare-full",

    entries,

    total:
      entries.length,

    batchSize:
      API_READ_BATCH_SIZE,
  };
}

async function fullBatch(
  entries: SiteSyncEntry[]
) {
  return stockBatch(
    entries
  );
}

export async function GET() {
  try {
    const token =
      await redisGetJson<{
        accessToken?: string;

        expiresAt?: number;
      }>(
        "jkfashion:olist:v3:oauth"
      );

    return NextResponse.json(
      {
        success: true,

        conectado:
          Boolean(
            token?.accessToken
          ),

        expiraEm:
          token?.expiresAt ||
          null,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Erro ao verificar a integração.",
      },

      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json().catch(
        () => ({})
      )) as AnyRecord;

    const mode =
      str(
        body.mode ||
          body.action ||
          "quick"
      ).toLowerCase();

    // =========================================================
    // PREPARA SINCRONIZAÇÃO RÁPIDA
    // =========================================================
    if (
      mode ===
      "prepare-quick"
    ) {
      return NextResponse.json(
        await withSyncLock(
          prepareQuick
        )
      );
    }

    // =========================================================
    // BATCH DE ESTOQUE
    // =========================================================
    if (
      mode === "stock-batch" ||
      mode === "quick" ||
      mode === "sync"
    ) {
      const entries:
        SiteSyncEntry[] =
        Array.isArray(
          body.entries
        )
          ? body.entries
              .filter(
                (entry) =>
                  entry &&
                  typeof entry ===
                    "object"
              )
              .map(
                (entry) => ({
                  siteId:
                    entry.siteId
                      ? str(
                          entry.siteId
                        )
                      : null,

                  tinyId:
                    str(
                      entry.tinyId
                    ),

                  nomeSite:
                    entry.nomeSite
                      ? str(
                          entry.nomeSite
                        )
                      : undefined,

                  nomeTiny:
                    entry.nomeTiny
                      ? str(
                          entry.nomeTiny
                        )
                      : undefined,

                  isNew:
                    Boolean(
                      entry.isNew
                    ),

                  matchMethod:
                    entry.matchMethod ===
                      "redis" ||
                    entry.matchMethod ===
                      "id" ||
                    entry.matchMethod ===
                      "nome" ||
                    entry.matchMethod ===
                      "similaridade" ||
                    entry.matchMethod ===
                      "novo"
                      ? entry.matchMethod
                      : undefined,
                })
              )
              .filter(
                (entry) =>
                  Boolean(
                    entry.tinyId
                  )
              )
          : [];

      if (
        entries.length ===
        0
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Nenhuma associação entre produto do site e produto Tiny foi enviada para sincronização.",
          },

          {
            status: 400,
          }
        );
      }

      return NextResponse.json(
        await stockBatch(
          entries
        )
      );
    }

    // =========================================================
    // PREPARA SINCRONIZAÇÃO COMPLETA
    // =========================================================
    if (
      mode ===
      "prepare-full"
    ) {
      return NextResponse.json(
        await withSyncLock(
          prepareFull
        )
      );
    }

    // =========================================================
    // BATCH COMPLETO
    // =========================================================
    if (
      mode ===
      "full-batch"
    ) {
      const entries:
        SiteSyncEntry[] =
        Array.isArray(
          body.entries
        )
          ? body.entries
              .filter(
                (entry) =>
                  entry &&
                  typeof entry ===
                    "object"
              )
              .map(
                (entry) => ({
                  siteId:
                    entry.siteId
                      ? str(
                          entry.siteId
                        )
                      : null,

                  tinyId:
                    str(
                      entry.tinyId
                    ),

                  nomeSite:
                    entry.nomeSite
                      ? str(
                          entry.nomeSite
                        )
                      : undefined,

                  nomeTiny:
                    entry.nomeTiny
                      ? str(
                          entry.nomeTiny
                        )
                      : undefined,

                  isNew:
                    Boolean(
                      entry.isNew
                    ),

                  matchMethod:
                    entry.matchMethod ===
                      "redis" ||
                    entry.matchMethod ===
                      "id" ||
                    entry.matchMethod ===
                      "nome" ||
                    entry.matchMethod ===
                      "similaridade" ||
                    entry.matchMethod ===
                      "novo"
                      ? entry.matchMethod
                      : undefined,
                })
              )
              .filter(
                (entry) =>
                  Boolean(
                    entry.tinyId
                  )
              )
          : [];

      if (
        entries.length ===
        0
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Nenhuma associação de produto foi enviada para a reconciliação completa.",
          },

          {
            status: 400,
          }
        );
      }

      return NextResponse.json(
        await fullBatch(
          entries
        )
      );
    }

    // =========================================================
    // MODO INVÁLIDO
    // =========================================================
    return NextResponse.json(
      {
        success: false,

        error:
          `Modo de sincronização inválido: ${mode}`,
      },

      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "=== ERRO NA SINCRONIZAÇÃO OLIST/TINY V3 ===",
      error
    );

    // =========================================================
    // ERRO DE OAUTH
    // =========================================================
    if (
      error instanceof
      OlistOAuthError
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            error.message,

          code:
            error.code,
        },

        {
          status:
            error.code ===
            "NOT_CONNECTED"
              ? 401
              : 500,
        }
      );
    }

    // =========================================================
    // ERRO GERAL
    // =========================================================
    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Erro interno na sincronização.",
      },

      {
        status: 500,
      }
    );
  }
}
