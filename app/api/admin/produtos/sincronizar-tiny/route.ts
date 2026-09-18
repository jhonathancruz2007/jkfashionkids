import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OlistOAuthError,
  getOlistV3,
  redisDelete,
  redisGetJson,
  redisSetNx,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const SYNC_LOCK_KEY = "jkfashion:olist:v3:sync:lock";
const SITE_TINY_MAP_PREFIX = "jkfashion:olist:v3:site-tiny:";

// O plano Construa tem limite publicado de 30 leituras/minuto por conta.
// A sincronização faz no máximo 18 leituras por lote, em sequência, com
// intervalo mínimo de 2,1 s entre chamadas. Isso deixa margem para a janela
// de 60 s e evita rajadas que causam 429.
const BATCH_SIZE = 18;
const MIN_DELAY_BETWEEN_TINY_CALLS_MS = 2100;
const RATE_LIMIT_WAIT_MS = 65_000;

// A sincronização deste botão é DELIBERADAMENTE somente de estoque.
// Não consulta catálogo, não altera produto, não altera preço, imagem,
// categoria ou faixa etária e não cria novos produtos.

type StockEntry = {
  siteId: string;
  tinyId?: string | null;
  nome?: string;
  estoqueAntes?: number | null;
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

function safeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? Math.round(value) : null;
  }
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP\s*429|\b429\b|rate.?limit/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function getStoredTinyId(siteId: string): Promise<string | null> {
  return redisGetJson<string>(`${SITE_TINY_MAP_PREFIX}${siteId}`).catch(() => null);
}

async function getTinyStock(tinyId: string): Promise<TinyStockResponse> {
  return getOlistV3<TinyStockResponse>(
    `/estoque/${encodeURIComponent(tinyId)}`
  );
}

async function prepareStock() {
  const products = await prisma.produto.findMany({
    select: {
      id: true,
      nome: true,
      estoque: true,
    },
    orderBy: { nome: "asc" },
  });

  const entries: StockEntry[] = products.map((product) => ({
    siteId: String(product.id),
    nome: String(product.nome || ""),
    estoqueAntes: Number.isFinite(Number(product.estoque))
      ? Number(product.estoque)
      : null,
  }));

  return {
    success: true,
    mode: "prepare-stock",
    entries,
    total: entries.length,
    batchSize: BATCH_SIZE,
    delayMs: MIN_DELAY_BETWEEN_TINY_CALLS_MS,
  };
}

async function syncStockBatch(entries: StockEntry[]) {
  const clean = entries
    .filter((entry) => entry && str(entry.siteId))
    .slice(0, BATCH_SIZE)
    .map((entry) => ({
      ...entry,
      siteId: str(entry.siteId),
      tinyId: str(entry.tinyId) || null,
    }));

  if (!clean.length) {
    return {
      success: true,
      mode: "stock-batch",
      processados: 0,
      atualizados: 0,
      alterados: 0,
      preservados: 0,
      falhas: 0,
      rateLimited: false,
      diagnosticos: [],
    };
  }

  return withSyncLock(async () => {
    let atualizados = 0;
    let alterados = 0;
    let preservados = 0;
    let falhas = 0;
    let processados = 0;
    let rateLimited = false;
    let retryAfterMs = 0;

    const diagnosticos: Array<Record<string, unknown>> = [];
    let lastCallStartedAt = 0;

    for (const entry of clean) {
      // Garante intervalo mínimo ENTRE o início das chamadas ao Tiny.
      const now = Date.now();
      const elapsed = now - lastCallStartedAt;
      if (lastCallStartedAt > 0 && elapsed < MIN_DELAY_BETWEEN_TINY_CALLS_MS) {
        await sleep(MIN_DELAY_BETWEEN_TINY_CALLS_MS - elapsed);
      }

      const siteProduct = await prisma.produto.findUnique({
        where: { id: entry.siteId },
        select: { id: true, nome: true, estoque: true },
      });

      if (!siteProduct) {
        falhas += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId || entry.siteId,
          nome: entry.nome || "",
          erro: "Produto não existe mais no site.",
        });
        continue;
      }

      const tinyId = entry.tinyId || (await getStoredTinyId(entry.siteId)) || entry.siteId;
      lastCallStartedAt = Date.now();

      try {
        const tiny = await getTinyStock(tinyId);
        const saldo = safeInt(tiny?.saldo);

        if (saldo == null) {
          // NUNCA converter ausência de saldo em zero.
          preservados += 1;
          processados += 1;
          diagnosticos.push({
            siteId: siteProduct.id,
            tinyId,
            nome: siteProduct.nome,
            siteStockBefore: siteProduct.estoque,
            tinyStock: null,
            disponivel: safeInt(tiny?.disponivel),
            reservado: safeInt(tiny?.reservado),
            estoqueMudou: false,
            preservado: true,
            erro: "O Tiny não retornou um saldo de estoque válido; estoque do site preservado.",
          });
          continue;
        }

        const mudou = Number(siteProduct.estoque) !== saldo;

        // Para esta versão alteramos SOMENTE o campo estoque.
        await prisma.produto.update({
          where: { id: siteProduct.id },
          data: { estoque: saldo },
        });

        atualizados += 1;
        if (mudou) alterados += 1;
        processados += 1;

        diagnosticos.push({
          siteId: siteProduct.id,
          tinyId,
          nome: siteProduct.nome,
          siteStockBefore: siteProduct.estoque,
          tinyStock: saldo,
          disponivel: safeInt(tiny?.disponivel),
          reservado: safeInt(tiny?.reservado),
          estoqueMudou: mudou,
          preservado: false,
        });
      } catch (error) {
        if (isRateLimitError(error)) {
          rateLimited = true;
          retryAfterMs = RATE_LIMIT_WAIT_MS;
          falhas += 1;
          diagnosticos.push({
            siteId: siteProduct.id,
            tinyId,
            nome: siteProduct.nome,
            siteStockBefore: siteProduct.estoque,
            tinyStock: null,
            estoqueMudou: false,
            rateLimited: true,
            erro: "Limite da API Olist/Tiny atingido. Nenhuma alteração foi feita neste produto.",
          });
          break;
        }

        falhas += 1;
        processados += 1;
        diagnosticos.push({
          siteId: siteProduct.id,
          tinyId,
          nome: siteProduct.nome,
          siteStockBefore: siteProduct.estoque,
          tinyStock: null,
          estoqueMudou: false,
          erro: error instanceof Error ? error.message : String(error),
          rateLimited: false,
        });
      }
    }

    return {
      success: true,
      mode: "stock-batch",
      processados,
      atualizados,
      alterados,
      preservados,
      falhas,
      rateLimited,
      retryAfterMs,
      restamNesteLote: Math.max(0, clean.length - processados),
      diagnosticos,
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = str(body.mode || "stock").toLowerCase();

    if (mode === "prepare-stock" || mode === "prepare-quick") {
      return NextResponse.json(await prepareStock());
    }

    if (mode === "stock-batch" || mode === "stock" || mode === "quick" || mode === "sync") {
      const entries: StockEntry[] = Array.isArray(body.entries)
        ? body.entries
            .filter((entry) => entry && typeof entry === "object")
            .map((entry: any) => ({
              siteId: str(entry.siteId),
              tinyId: str(entry.tinyId) || null,
              nome: str(entry.nome || entry.nomeSite),
              estoqueAntes: safeInt(entry.estoqueAntes ?? entry.siteStockBefore),
            }))
            .filter((entry) => Boolean(entry.siteId))
        : [];

      if (!entries.length) {
        return NextResponse.json(
          { success: false, error: "Nenhum produto foi enviado para sincronização de estoque." },
          { status: 400 }
        );
      }

      const result = await syncStockBatch(entries);

      if (result.rateLimited) {
        return NextResponse.json(result, { status: 429 });
      }

      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, error: `Modo de sincronização inválido: ${mode}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("=== ERRO NA SINCRONIZAÇÃO DE ESTOQUE OLIST/TINY V3 ===");
    console.error(error);

    if (error instanceof OlistOAuthError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.code === "NOT_CONNECTED" ? 401 : 400 }
      );
    }

    if (isRateLimitError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "O limite de leituras da API Olist/Tiny foi atingido. Aguarde cerca de 1 minuto e tente novamente.",
          rateLimited: true,
          retryAfterMs: RATE_LIMIT_WAIT_MS,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao sincronizar o estoque.",
      },
      { status: 500 }
    );
  }
}
