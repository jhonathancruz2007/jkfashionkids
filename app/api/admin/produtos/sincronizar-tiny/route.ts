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
const QUICK_NEW_CURSOR_KEY = "jkfashion:olist:v3:sync:new-products-last";
const QUICK_NEW_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const API_READ_BATCH_SIZE = 28;
const DETAIL_CONCURRENCY = 10;
const FULL_BATCH_SIZE = 28;
const PLACEHOLDER_IMAGE = "";

type AnyRecord = Record<string, any>;

type TinyListItem = {
  id?: number;
  sku?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  situacao?: string | null;
  dataCriacao?: string | null;
  dataAlteracao?: string | null;
  tipoVariacao?: string | null;
  produtoPai?: { id?: number | null } | null;
};

type TinyGrade = Array<{ chave?: string | null; valor?: string | null }> | null | undefined;

type TinyVariation = {
  id?: number;
  descricao?: string | null;
  sku?: string | null;
  gtin?: string | null;
  estoque?: { quantidade?: number | null } | null;
  grade?: TinyGrade;
};

type TinyDetail = {
  id?: number | null;
  sku?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  descricaoComplementar?: string | null;
  situacao?: string | null;
  categoria?: { id?: number | null; nome?: string | null } | null;
  precos?: {
    preco?: number | null;
    precoPromocional?: number | null;
  } | null;
  estoque?: {
    controlar?: boolean | null;
    quantidade?: number | null;
  } | null;
  anexos?: Array<{ id?: number; url?: string; externo?: boolean }> | null;
  variacoes?: TinyVariation[] | null;
  tipoVariacao?: string | null;
  produtoPai?: { id?: number | null; sku?: string | null } | null;
};

type TinyListResponse = {
  itens?: TinyListItem[];
  paginacao?: { limit?: number; offset?: number; total?: number };
};

type StockAggregate = {
  estoque: number;
  tamanhos: string[];
  cores: string[];
  estoquePorTamanho: Record<string, number>;
  estoquePorCor: Record<string, any>;
  variationCount: number;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeNonNegativeInt(value: unknown): number | null {
  const n = num(value);
  if (n == null || n < 0) return null;
  return Math.round(n);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    const oa = order.get(normalize(a));
    const ob = order.get(normalize(b));
    if (oa != null && ob != null) return oa - ob;
    if (oa != null) return -1;
    if (ob != null) return 1;
    return a.localeCompare(b, "pt-BR", { numeric: true });
  });
}

function parseGrade(
  grade: TinyGrade,
  descricao: string,
  knownSizes: string[] = [],
  knownColors: string[] = []
): { tamanho: string; cor: string } {
  let tamanho = "";
  let cor = "";

  const knownSizeMap = new Map(knownSizes.map((v) => [normalize(v), v]));
  const knownColorMap = new Map(knownColors.map((v) => [normalize(v), v]));

  const inspect = (keyRaw: unknown, valueRaw: unknown) => {
    const key = normalize(str(keyRaw));
    const value = str(valueRaw);
    if (!value) return;

    if (!tamanho && (key.includes("tamanho") || key === "tam" || key.includes("size"))) {
      tamanho = value;
    }
    if (!cor && (key.includes("cor") || key.includes("color") || key.includes("colour"))) {
      cor = value;
    }

    const normalizedValue = normalize(value);
    if (!tamanho && knownSizeMap.has(normalizedValue)) {
      tamanho = knownSizeMap.get(normalizedValue)!;
    }
    if (!cor && knownColorMap.has(normalizedValue)) {
      cor = knownColorMap.get(normalizedValue)!;
    }
  };

  if (Array.isArray(grade)) {
    for (const item of grade) {
      inspect(item?.chave, item?.valor);
    }
  }

  if ((!tamanho || !cor) && descricao) {
    const parts = descricao
      .split(" - ")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      const tailA = parts[parts.length - 2];
      const tailB = parts[parts.length - 1];
      if (!tamanho && knownSizeMap.has(normalize(tailA))) tamanho = knownSizeMap.get(normalize(tailA))!;
      if (!cor && knownColorMap.has(normalize(tailA))) cor = knownColorMap.get(normalize(tailA))!;
      if (!tamanho && knownSizeMap.has(normalize(tailB))) tamanho = knownSizeMap.get(normalize(tailB))!;
      if (!cor && knownColorMap.has(normalize(tailB))) cor = knownColorMap.get(normalize(tailB))!;

      if (!tamanho && !cor && parts.length >= 3) {
        tamanho = tailA;
        cor = tailB;
      } else if (!tamanho && !cor) {
        tamanho = tailA;
      }
    }
  }

  return { tamanho, cor };
}

function aggregateDetail(
  detail: TinyDetail,
  knownSizes: string[] = [],
  knownColors: string[] = []
): StockAggregate | null {
  const variations = Array.isArray(detail.variacoes) ? detail.variacoes : [];

  if (variations.length === 0) {
    const qty = safeNonNegativeInt(detail.estoque?.quantidade);
    if (qty == null) return null;

    return {
      estoque: qty,
      tamanhos: [],
      cores: [],
      estoquePorTamanho: {},
      estoquePorCor: {},
      variationCount: 0,
    };
  }

  let total = 0;
  let sawValidQuantity = false;
  const sizes = new Set<string>();
  const colors = new Set<string>();
  const bySize = new Map<string, number>();
  const matrixByColor: Record<string, Record<string, number>> = {};
  const colorTotals = new Map<string, number>();

  for (const variation of variations) {
    const qty = safeNonNegativeInt(variation.estoque?.quantidade);
    if (qty == null) {
      return null;
    }

    sawValidQuantity = true;
    total += qty;

    const grade = parseGrade(
      variation.grade,
      str(variation.descricao),
      knownSizes,
      knownColors
    );

    if (grade.tamanho) {
      sizes.add(grade.tamanho);
      bySize.set(grade.tamanho, (bySize.get(grade.tamanho) || 0) + qty);
    }

    if (grade.cor) {
      colors.add(grade.cor);
      colorTotals.set(grade.cor, (colorTotals.get(grade.cor) || 0) + qty);
      if (grade.tamanho) {
        matrixByColor[grade.cor] ||= {};
        matrixByColor[grade.cor][grade.tamanho] = qty;
      }
    }
  }

  if (!sawValidQuantity) return null;

  const tamanhos = sortSizes([...sizes]);
  const cores = [...colors].sort((a, b) => a.localeCompare(b, "pt-BR"));

  let estoquePorCor: Record<string, any> = {};

  if (cores.length > 0 && tamanhos.length > 0) {
    for (const cor of cores) {
      estoquePorCor[cor] = matrixByColor[cor] || { total: colorTotals.get(cor) || 0 };
    }
  } else {
    estoquePorCor = Object.fromEntries(
      cores.map((cor) => [cor, colorTotals.get(cor) || 0])
    );
  }

  return {
    estoque: total,
    tamanhos,
    cores,
    estoquePorTamanho: Object.fromEntries(
      tamanhos.map((size) => [size, bySize.get(size) || 0])
    ),
    estoquePorCor,
    variationCount: variations.length,
  };
}

function imageUrls(detail: TinyDetail): string[] {
  return [...new Set(
    (detail.anexos || [])
      .map((item) => str(item?.url))
      .filter((url) => /^https?:\/\//i.test(url))
  )];
}

function canonicalId(item: TinyListItem): string | null {
  const id = Number(item.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return String(id);
}

async function listProducts(params: Record<string, string>): Promise<TinyListResponse> {
  const query = new URLSearchParams(params);
  return getOlistV3<TinyListResponse>(`/produtos?${query.toString()}`);
}

async function listAllProductHeaders(): Promise<TinyListItem[]> {
  const all: TinyListItem[] = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const data = await listProducts({
      limit: String(limit),
      offset: String(offset),
    });

    const items = Array.isArray(data.itens) ? data.itens : [];
    all.push(...items);

    const total = Number(data.paginacao?.total || 0);
    if (items.length === 0 || items.length < limit || offset + items.length >= total) break;
    offset += items.length;
  }

  return all;
}

function uniqueCanonicalHeaders(items: TinyListItem[]): TinyListItem[] {
  const seen = new Set<string>();
  const result: TinyListItem[] = [];

  for (const item of items) {
    const tipoVariacao = normalize(str(item.tipoVariacao));
    if (tipoVariacao === "v") continue;

    const id = canonicalId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }

  return result;
}

function sinceDateString(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function getDetail(id: string): Promise<TinyDetail> {
  return getOlistV3<TinyDetail>(`/produtos/${encodeURIComponent(id)}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function updateExistingProduct(id: string, detail: TinyDetail): Promise<{ updated: boolean; variationCount: number }> {
  const existing = await prisma.produto.findUnique({
    where: { id },
    select: {
      id: true,
      tamanhos: true,
      cores: true,
      estoquePorTamanho: true,
      estoquePorCor: true,
    },
  });

  if (!existing) return { updated: false, variationCount: 0 };

  const aggregate = aggregateDetail(
    detail,
    existing.tamanhos || [],
    existing.cores || []
  );

  if (!aggregate) {
    throw new Error(`Estoque inválido ou ausente no produto Tiny ${id}. Produto preservado no site.`);
  }

  await prisma.produto.update({
    where: { id },
    data: {
      estoque: aggregate.estoque,
      tamanhos: aggregate.tamanhos,
      estoquePorTamanho: aggregate.estoquePorTamanho,
      cores: aggregate.cores,
      estoquePorCor: aggregate.estoquePorCor,
    },
  });

  return {
    updated: true,
    variationCount: aggregate.variationCount,
  };
}

async function createNewProduct(id: string, detail: TinyDetail): Promise<{ created: boolean; variationCount: number }> {
  const existing = await prisma.produto.findUnique({ where: { id }, select: { id: true } });
  if (existing) return { created: false, variationCount: 0 };

  const aggregate = aggregateDetail(detail);
  if (!aggregate) {
    throw new Error(`Estoque inválido ou ausente no novo produto Tiny ${id}. Produto não foi cadastrado.`);
  }

  const descricao =
    str(detail.descricaoComplementar) ||
    str(detail.descricao) ||
    `Produto ${id}`;

  const nome = str(detail.descricao) || `Produto ${id}`;
  const imagens = imageUrls(detail);
  const preco = num(detail.precos?.preco) ?? 0;
  const promocional = num(detail.precos?.precoPromocional);

  await prisma.produto.create({
    data: {
      id,
      nome,
      descricao,
      preco,
      precoPromocional:
        promocional != null && promocional > 0 ? promocional : null,
      imagemUrl: imagens[0] || PLACEHOLDER_IMAGE,
      imagens,
      estoque: aggregate.estoque,
      tamanhos: aggregate.tamanhos,
      estoquePorTamanho: aggregate.estoquePorTamanho,
      cores: aggregate.cores,
      estoquePorCor: aggregate.estoquePorCor,
      coresDetalhes: undefined,
      genero: null,
      faixaEtaria: null,
      ativo: str(detail.situacao).toUpperCase() === "A",
      categoriaNome: null,
    },
  });

  return {
    created: true,
    variationCount: aggregate.variationCount,
  };
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const locked = await redisSetNx(SYNC_LOCK_KEY, owner, 120);
  if (!locked) {
    throw new Error("Já existe uma sincronização do Tiny em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

async function prepareQuick() {
  const siteProducts = await prisma.produto.findMany({
    select: { id: true },
  });

  const siteIds = siteProducts
    .map((p) => String(p.id))
    .filter(Boolean);
  const siteIdSet = new Set(siteIds);

  const lastCreated = await redisGetJson<{ timestamp?: number }>(QUICK_NEW_CURSOR_KEY);
  const now = Date.now();
  const since = Math.max(
    0,
    (lastCreated?.timestamp || now - QUICK_NEW_LOOKBACK_MS)
  );

  // Stock changes do NOT reliably change dataAlteracao on the product listing.
  // We therefore discover new products separately, then reconcile the actual
  // stock by reading each canonical product detail in controlled batches.
  const createdFirst = await listProducts({
    limit: "100",
    offset: "0",
    dataCriacao: sinceDateString(since),
    situacao: "A",
  });

  const createdHeaders = uniqueCanonicalHeaders(
    Array.isArray(createdFirst.itens) ? createdFirst.itens : []
  );

  const newIds = createdHeaders
    .map((item) => canonicalId(item))
    .filter((id): id is string => Boolean(id) && !siteIdSet.has(id));

  const ids = [...new Set([...siteIds, ...newIds])];

  return {
    success: true,
    mode: "prepare-quick",
    ids,
    total: ids.length,
    existingCount: siteIds.length,
    newCount: newIds.length,
    batchSize: API_READ_BATCH_SIZE,
    dataCorteNovos: new Date(since).toISOString(),
    totalTinyNovosEncontrados: newIds.length,
  };
}

async function stockBatch(ids: string[]) {
  const cleanIds = [...new Set(ids.map(String).filter(Boolean))]
    .slice(0, API_READ_BATCH_SIZE);

  if (cleanIds.length === 0) {
    return {
      success: true,
      mode: "stock-batch",
      criados: 0,
      atualizados: 0,
      ignorados: 0,
      falhas: 0,
      variacoesProcessadas: 0,
      processados: 0,
    };
  }

  return withSyncLock(async () => {
    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;
    let falhas = 0;
    let variacoesProcessadas = 0;

    const results = await mapWithConcurrency(
      cleanIds,
      DETAIL_CONCURRENCY,
      async (id) => {
        try {
          const detail = await getDetail(id);
          const existing = await prisma.produto.findUnique({
            where: { id },
            select: { id: true },
          });

          if (existing) {
            const result = await updateExistingProduct(id, detail);
            return {
              kind: result.updated ? "updated" : "ignored",
              variationCount: result.variationCount,
            };
          }

          if (str(detail.situacao).toUpperCase() !== "E") {
            const result = await createNewProduct(id, detail);
            return {
              kind: result.created ? "created" : "ignored",
              variationCount: result.variationCount,
            };
          }

          return { kind: "ignored", variationCount: 0 };
        } catch (error) {
          console.error(`[Olist V3] Falha no produto ${id}:`, error);
          return {
            kind: "failed",
            variationCount: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    for (const result of results) {
      if (result.kind === "created") criados += 1;
      else if (result.kind === "updated") atualizados += 1;
      else if (result.kind === "ignored") ignorados += 1;
      else falhas += 1;
      variacoesProcessadas += result.variationCount || 0;
    }

    return {
      success: true,
      mode: "stock-batch",
      criados,
      atualizados,
      ignorados,
      falhas,
      variacoesProcessadas,
      processados: cleanIds.length,
    };
  });
}

async function prepareFull() {
  const siteProducts = await prisma.produto.findMany({ select: { id: true } });
  const ids = siteProducts.map((p) => String(p.id)).filter(Boolean);
  return {
    success: true,
    mode: "prepare-full",
    ids,
    total: ids.length,
    batchSize: API_READ_BATCH_SIZE,
  };
}

async function fullBatch(ids: string[]) {
  return stockBatch(ids);
}

export async function GET() {
  try {
    const token = await redisGetJson<{ accessToken?: string; expiresAt?: number }>(
      "jkfashion:olist:v3:oauth"
    );

    return NextResponse.json({
      success: true,
      conectado: Boolean(token?.accessToken),
      expiraEm: token?.expiresAt || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao verificar a integração.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnyRecord;
    const mode = str(body.mode || body.action || "quick").toLowerCase();

    if (mode === "prepare-quick") {
      return NextResponse.json(await withSyncLock(prepareQuick));
    }

    if (mode === "stock-batch" || mode === "quick" || mode === "sync") {
      const ids = Array.isArray(body.ids)
        ? body.ids.map((id) => str(id)).filter(Boolean)
        : [];

      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: "Nenhum ID de produto foi enviado para sincronização." },
          { status: 400 }
        );
      }

      return NextResponse.json(await stockBatch(ids));
    }

    if (mode === "prepare-full") {
      return NextResponse.json(await withSyncLock(prepareFull));
    }

    if (mode === "full-batch") {
      const ids = Array.isArray(body.ids) ? body.ids.map((id) => str(id)).filter(Boolean) : [];
      return NextResponse.json(await fullBatch(ids));
    }

    return NextResponse.json(
      { success: false, error: `Modo de sincronização inválido: ${mode}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("=== ERRO NA SINCRONIZAÇÃO OLIST/TINY V3 ===", error);

    if (error instanceof OlistOAuthError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: error.code === "NOT_CONNECTED" ? 401 : 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno na sincronização.",
      },
      { status: 500 }
    );
  }
}
