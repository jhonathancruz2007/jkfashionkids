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
const QUICK_CURSOR_KEY = "jkfashion:olist:v3:sync:last";
const DEFAULT_QUICK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const OVERLAP_MS = 2 * 60 * 1000;
const V3_READ_GAP_MS = 2050;
const FULL_BATCH_SIZE = 5;
const QUICK_MAX_DETAILS = 10;
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

async function delayForNextRead(lastReadAt: number): Promise<number> {
  const wait = Math.max(0, V3_READ_GAP_MS - (Date.now() - lastReadAt));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  return Date.now();
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

async function quickSync() {
  const started = Date.now();
  const cursor = await redisGetJson<{ timestamp?: number }>(QUICK_CURSOR_KEY);
  const now = Date.now();
  const since = Math.max(
    0,
    (cursor?.timestamp || now - DEFAULT_QUICK_LOOKBACK_MS) - OVERLAP_MS
  );

  // 1) Incremental stock/product changes since the last successful quick sync.
  // We intentionally do NOT scan the entire catalog here: that would make the
  // normal button slow and consume the V3 read quota.
  const siteIds = new Set(
    (
      await prisma.produto.findMany({
        select: { id: true },
      })
    ).map((p) => String(p.id))
  );

  const changedFirst = await listProducts({
    limit: "100",
    offset: "0",
    dataAlteracao: sinceDateString(since),
  });

  // New products are detected by dataCriacao. We do not need another catalog
  // scan: the creation filter is enough to discover products created since the
  // last successful quick sync.
  const createdFirst = await listProducts({
    limit: "100",
    offset: "0",
    dataCriacao: sinceDateString(since),
  });

  const changedHeaders = Array.isArray(changedFirst.itens) ? changedFirst.itens : [];
  const createdHeaders = Array.isArray(createdFirst.itens) ? createdFirst.itens : [];

  const newHeaders = createdHeaders.filter((item) => {
    const id = canonicalId(item);
    return id && !siteIds.has(id) && str(item.situacao).toUpperCase() !== "E";
  });

  const candidates = uniqueCanonicalHeaders([...changedHeaders, ...createdHeaders]);

  const prioritized = candidates.sort((a, b) => {
    const aNew = newHeaders.some((n) => String(n.id) === String(a.id));
    const bNew = newHeaders.some((n) => String(n.id) === String(b.id));
    return Number(bNew) - Number(aNew);
  });

  if (prioritized.length > QUICK_MAX_DETAILS) {
    return {
      success: true,
      mode: "quick",
      criados: 0,
      atualizados: 0,
      ignorados: 0,
      falhas: 0,
      variacoesProcessadas: 0,
      pendentes: prioritized.length,
      message:
        `Foram encontradas ${prioritized.length} alterações. Para evitar timeout e respeitar o limite da API, a sincronização rápida não iniciou a atualização automática. Use a reconciliação completa para processar tudo em lotes.`,
      duracaoMs: Date.now() - started,
    };
  }

  let lastReadAt = Date.now();
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  let falhas = 0;
  let variacoesProcessadas = 0;

  for (const header of prioritized) {
    const id = canonicalId(header);
    if (!id) continue;

    try {
      lastReadAt = await delayForNextRead(lastReadAt);
      const detail = await getDetail(id);

      const exists = await prisma.produto.findUnique({
        where: { id },
        select: { id: true },
      });

      if (exists) {
        const result = await updateExistingProduct(id, detail);
        if (result.updated) atualizados += 1;
        variacoesProcessadas += result.variationCount;
      } else if (str(detail.situacao).toUpperCase() !== "E") {
        const result = await createNewProduct(id, detail);
        if (result.created) criados += 1;
        variacoesProcessadas += result.variationCount;
      } else {
        ignorados += 1;
      }
    } catch (error) {
      falhas += 1;
      console.error(`[Tiny V3] Falha no produto ${id}:`, error);
    }
  }

  // Only advance the cursor when every selected candidate was processed without
  // error. If something failed, keep the previous cursor so the next quick sync
  // retries that window instead of silently losing an update.
  if (falhas === 0) {
    await redisSetJson(QUICK_CURSOR_KEY, { timestamp: now });
  }

  return {
    success: true,
    mode: "quick",
    criados,
    atualizados,
    ignorados,
    falhas,
    variacoesProcessadas,
    pendentes: 0,
    duracaoMs: Date.now() - started,
    dataCorte: new Date(since).toISOString(),
    candidatos: prioritized.length,
  };
}

async function prepareFull() {
  const headers = uniqueCanonicalHeaders(await listAllProductHeaders());
  const ids = headers
    .map((item) => canonicalId(item))
    .filter((id): id is string => Boolean(id));

  return {
    success: true,
    mode: "prepare-full",
    ids,
    total: ids.length,
    batchSize: FULL_BATCH_SIZE,
  };
}

async function fullBatch(ids: string[]) {
  const cleanIds = [...new Set(ids.map(String).filter(Boolean))].slice(0, FULL_BATCH_SIZE);
  if (cleanIds.length === 0) {
    return { success: true, mode: "full-batch", criados: 0, atualizados: 0, falhas: 0, variacoesProcessadas: 0 };
  }

  return withSyncLock(async () => {
    let lastReadAt = Date.now();
    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;
    let falhas = 0;
    let variacoesProcessadas = 0;

    for (const id of cleanIds) {
      try {
        lastReadAt = await delayForNextRead(lastReadAt);
        const detail = await getDetail(id);

        const existing = await prisma.produto.findUnique({
          where: { id },
          select: {
            id: true,
            tamanhos: true,
            cores: true,
          },
        });

        if (existing) {
          const result = await updateExistingProduct(id, detail);
          if (result.updated) atualizados += 1;
          variacoesProcessadas += result.variationCount;
        } else if (str(detail.situacao).toUpperCase() !== "E") {
          const result = await createNewProduct(id, detail);
          if (result.created) criados += 1;
          variacoesProcessadas += result.variationCount;
        } else {
          ignorados += 1;
        }
      } catch (error) {
        falhas += 1;
        console.error(`[Tiny V3][FULL] Falha no produto ${id}:`, error);
      }
    }

    return {
      success: true,
      mode: "full-batch",
      criados,
      atualizados,
      ignorados,
      falhas,
      variacoesProcessadas,
      processados: cleanIds.length,
    };
  });
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

    if (mode === "quick" || mode === "sync") {
      return NextResponse.json(await withSyncLock(quickSync));
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
