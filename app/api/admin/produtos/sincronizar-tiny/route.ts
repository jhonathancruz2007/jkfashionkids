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

const SYNC_LOCK_KEY = "jkfashion:olist:v3:stock-sync:lock";
const RATE_WINDOW_KEY = "jkfashion:olist:v3:stock-sync:rate-window";
const RATE_WINDOW_MS = 60_000;
const MAX_READS_PER_WINDOW = 28;
const DEFAULT_NEXT_BATCH_WAIT_MS = 62_000;
const BATCH_SIZE = 28;
const STOCK_CONCURRENCY = 20;

type AnyRecord = Record<string, any>;

type SiteSyncEntry = {
  siteId: string;
  tinyId: string;
  nomeSite: string;
};

type TinyStockResponse = {
  id?: number | null;
  nome?: string | null;
  codigo?: string | null;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function nonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function isNumericTinyId(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const locked = await redisSetNx(SYNC_LOCK_KEY, owner, 90);
  if (!locked) {
    throw new Error("Já existe uma sincronização de estoque em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

async function reserveReadWindow(requested: number): Promise<{ allowed: boolean; waitMs: number }> {
  const now = Date.now();
  const state = await redisGetJson<{ startedAt: number; count: number }>(RATE_WINDOW_KEY).catch(() => null);

  if (!state || !Number.isFinite(state.startedAt) || now - state.startedAt >= RATE_WINDOW_MS) {
    await redisSetJson(
      RATE_WINDOW_KEY,
      { startedAt: now, count: requested },
      90
    );
    return { allowed: true, waitMs: 0 };
  }

  const count = Number(state.count || 0);
  if (count + requested <= MAX_READS_PER_WINDOW) {
    await redisSetJson(
      RATE_WINDOW_KEY,
      { startedAt: state.startedAt, count: count + requested },
      90
    );
    return { allowed: true, waitMs: 0 };
  }

  return {
    allowed: false,
    waitMs: Math.max(1000, RATE_WINDOW_MS - (now - state.startedAt) + 1500),
  };
}

async function getStock(tinyId: string): Promise<TinyStockResponse> {
  if (!isNumericTinyId(tinyId)) {
    throw new Error(`ID Tiny inválido: ${tinyId}`);
  }

  // Fonte oficial do estoque total: GET /estoque/{idProduto} -> saldo.
  return getOlistV3<TinyStockResponse>(`/estoque/${encodeURIComponent(tinyId)}`);
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

async function prepareStock() {
  const siteProducts = await prisma.produto.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  const entries: SiteSyncEntry[] = [];
  let semIdNumerico = 0;

  for (const product of siteProducts) {
    const siteId = String(product.id || "").trim();
    const nomeSite = String(product.nome || "").trim();

    // Os produtos do catálogo atual usam o ID do Tiny como ID do Produto no site.
    // Não tentamos casar por nome nesta rotina: isso evita associar estoque ao
    // produto errado e elimina leituras desnecessárias da API.
    if (!isNumericTinyId(siteId)) {
      semIdNumerico += 1;
      continue;
    }

    entries.push({
      siteId,
      tinyId: siteId,
      nomeSite,
    });
  }

  return {
    success: true,
    mode: "prepare-stock",
    entries,
    total: entries.length,
    skippedWithoutNumericId: semIdNumerico,
    batchSize: BATCH_SIZE,
  };
}

type BatchResult = {
  ok: boolean;
  changed: boolean;
  siteId: string;
  tinyId: string;
  nomeSite: string;
  siteStockBefore: number | null;
  tinyStock: number | null;
  reservado: number | null;
  disponivel: number | null;
  error?: string;
};

async function processStockBatch(entries: SiteSyncEntry[]) {
  const cleanEntries = entries.slice(0, BATCH_SIZE);
  if (cleanEntries.length === 0) {
    return {
      success: true,
      mode: "stock-total-batch",
      atualizados: 0,
      estoqueAlterado: 0,
      falhas: 0,
      processados: 0,
      diagnosticos: [],
      nextBatchWaitMs: DEFAULT_NEXT_BATCH_WAIT_MS,
    };
  }

  const reserved = await reserveReadWindow(cleanEntries.length);
  if (!reserved.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMIT",
        error: "Aguarde a próxima janela do limite da API Olist/Tiny.",
        waitMs: reserved.waitMs,
      },
      { status: 429 }
    );
  }

  let atualizados = 0;
  let estoqueAlterado = 0;
  let falhas = 0;

  const results = await mapWithConcurrency<SiteSyncEntry, BatchResult>(
    cleanEntries,
    STOCK_CONCURRENCY,
    async (entry): Promise<BatchResult> => {
      try {
        const stock = await getStock(entry.tinyId);
        const tinyStock = nonNegativeNumber(stock?.saldo);
        const reservado = nonNegativeNumber(stock?.reservado);
        const disponivel = nonNegativeNumber(stock?.disponivel);

        // É proibido interpretar resposta incompleta como zero.
        if (tinyStock == null) {
          throw new Error(
            `O Tiny não retornou um saldo válido para o produto ${entry.tinyId}. Estoque preservado.`
          );
        }

        const existing = await prisma.produto.findUnique({
          where: { id: entry.siteId },
          select: { id: true, estoque: true },
        });

        if (!existing) {
          return {
            ok: true,
            changed: false,
            siteId: entry.siteId,
            tinyId: entry.tinyId,
            nomeSite: entry.nomeSite,
            siteStockBefore: null,
            tinyStock,
            reservado,
            disponivel,
            error: "Produto não existe mais no site.",
          };
        }

        const changed = Number(existing.estoque || 0) !== tinyStock;

        await prisma.produto.update({
          where: { id: entry.siteId },
          data: {
            // SOMENTE estoque total. Nada mais do cadastro é tocado.
            estoque: tinyStock,
          },
        });

        return {
          ok: true,
          changed,
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nomeSite: entry.nomeSite,
          siteStockBefore: Number(existing.estoque || 0),
          tinyStock,
          reservado,
          disponivel,
        };
      } catch (error) {
        return {
          ok: false,
          changed: false,
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nomeSite: entry.nomeSite,
          siteStockBefore: null,
          tinyStock: null,
          reservado: null,
          disponivel: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  for (const result of results) {
    if (result.ok && result.tinyStock != null) {
      atualizados += 1;
      if (result.changed) estoqueAlterado += 1;
    } else {
      falhas += 1;
    }
  }

  return {
    success: true,
    mode: "stock-total-batch",
    atualizados,
    estoqueAlterado,
    falhas,
    processados: cleanEntries.length,
    diagnosticos: results,
    // O próximo lote precisa respeitar a janela de 60s do plano Construa.
    nextBatchWaitMs: DEFAULT_NEXT_BATCH_WAIT_MS,
  };
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
    const mode = str(body.mode || body.action || "").toLowerCase();

    if (mode === "prepare-stock") {
      return NextResponse.json(await prepareStock());
    }

    if (mode === "stock-total-batch") {
      const entries: SiteSyncEntry[] = Array.isArray(body.entries)
        ? body.entries
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              siteId: str(entry.siteId),
              tinyId: str(entry.tinyId),
              nomeSite: str(entry.nomeSite),
            }))
            .filter((entry) => Boolean(entry.siteId && entry.tinyId))
        : [];

      if (entries.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Nenhum produto foi enviado para sincronização de estoque.",
          },
          { status: 400 }
        );
      }

      return withSyncLock(async () => processStockBatch(entries));
    }

    return NextResponse.json(
      { success: false, error: `Modo de sincronização inválido: ${mode}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("=== ERRO NA SINCRONIZAÇÃO DE ESTOQUE OLIST/TINY V3 ===", error);

    if (error instanceof OlistOAuthError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: error.code === "NOT_CONNECTED" ? 401 : 502 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno ao sincronizar o estoque.",
      },
      { status: 500 }
    );
  }
}
