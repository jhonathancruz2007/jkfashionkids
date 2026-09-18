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
export const maxDuration = 50;

const SYNC_LOCK_KEY = "jkfashion:olist:v3:sync:lock";
const STOCK_BATCH_SIZE = 20;
const STOCK_CALL_INTERVAL_MS = 2050;

type AnyRecord = Record<string, any>;

type SiteStockEntry = {
  siteId: string;
  tinyId: string;
  nome: string;
  siteStockBefore: number;
  temVariacoes: boolean;
};

type TinyStockResponse = {
  id?: number | null;
  nome?: string | null;
  codigo?: string | null;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
};

type TinyVariation = {
  estoque?: { quantidade?: number | null } | null;
};

type TinyDetail = {
  tipo?: string | null;
  tipoVariacao?: string | null;
  estoque?: { quantidade?: number | null } | null;
  variacoes?: TinyVariation[] | null;
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

function safeStock(value: unknown): number | null {
  const n = num(value);
  if (n == null || n < 0) return null;
  return Math.round(n);
}

function hasVariationData(input: {
  tamanhos?: string[] | null;
  cores?: string[] | null;
  estoquePorTamanho?: unknown;
  estoquePorCor?: unknown;
}): boolean {
  return Boolean(
    (Array.isArray(input.tamanhos) && input.tamanhos.length > 0) ||
    (Array.isArray(input.cores) && input.cores.length > 0) ||
    (input.estoquePorTamanho && typeof input.estoquePorTamanho === "object") ||
    (input.estoquePorCor && typeof input.estoquePorCor === "object")
  );
}

async function createOlistRateLimitedCaller() {
  let nextAllowedAt = 0;

  return async function call<T>(path: string): Promise<T> {
    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      const result = await getOlistV3<T>(path);
      nextAllowedAt = Date.now() + STOCK_CALL_INTERVAL_MS;
      return result;
    } catch (error) {
      nextAllowedAt = Date.now() + STOCK_CALL_INTERVAL_MS;
      throw error;
    }
  };
}

function sumValidVariationStock(detail: TinyDetail): { total: number; valid: boolean; count: number } {
  const variations = Array.isArray(detail.variacoes) ? detail.variacoes : [];
  if (variations.length === 0) {
    return { total: 0, valid: false, count: 0 };
  }

  let total = 0;
  for (const variation of variations) {
    const qty = safeStock(variation?.estoque?.quantidade);
    if (qty == null) return { total: 0, valid: false, count: variations.length };
    total += qty;
  }

  return { total, valid: true, count: variations.length };
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const locked = await redisSetNx(SYNC_LOCK_KEY, owner, 180);
  if (!locked) {
    throw new Error("Já existe uma sincronização de estoque em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

async function prepareStock() {
  const siteProducts = await prisma.produto.findMany({
    select: {
      id: true,
      nome: true,
      estoque: true,
      tamanhos: true,
      cores: true,
      estoquePorTamanho: true,
      estoquePorCor: true,
    },
    orderBy: { id: "asc" },
  });

  const entries: SiteStockEntry[] = siteProducts.map((product) => ({
    // Seu catálogo já usa o ID do Tiny/Olist como ID do produto no site.
    siteId: String(product.id),
    tinyId: String(product.id),
    nome: String(product.nome || ""),
    siteStockBefore: Number(product.estoque || 0),
    temVariacoes: hasVariationData(product),
  }));

  return {
    success: true,
    mode: "prepare-stock",
    entries,
    total: entries.length,
    batchSize: STOCK_BATCH_SIZE,
    intervalMs: STOCK_CALL_INTERVAL_MS,
  };
}

async function stockBatch(entries: SiteStockEntry[]) {
  const cleanEntries = entries
    .filter((entry) => entry && entry.siteId && entry.tinyId)
    .slice(0, STOCK_BATCH_SIZE);

  if (cleanEntries.length === 0) {
    return {
      success: true,
      mode: "stock-batch",
      atualizados: 0,
      estoqueAlterado: 0,
      preservados: 0,
      falhas: 0,
      rateLimited: 0,
      processados: 0,
      diagnosticos: [],
    };
  }

  return withSyncLock(async () => {
    let atualizados = 0;
    let estoqueAlterado = 0;
    let preservados = 0;
    let falhas = 0;
    let rateLimited = 0;
    let processados = 0;
    const diagnosticos: Array<Record<string, unknown>> = [];

    const callOlist = await createOlistRateLimitedCaller();

    for (let index = 0; index < cleanEntries.length; index += 1) {
      const entry = cleanEntries[index];

      try {
        const existing = await prisma.produto.findUnique({
          where: { id: entry.siteId },
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

        if (!existing) {
          processados += 1;
          continue;
        }

        const stock = await callOlist<TinyStockResponse>(`/estoque/${encodeURIComponent(entry.tinyId)}`);
        const saldo = safeStock(stock?.saldo);
        let tinyStock: number | null = saldo;
        let fonte = "estoque.saldo";
        let confirmadoPorDetalhe = false;

        // Produtos com variações são o caso que apresentou problema nas versões
        // anteriores. Se o endpoint de estoque do pai vier 0, fazemos uma segunda
        // leitura somente nesse cenário e só aceitamos o zero quando as variações
        // também confirmarem zero.
        if (entry.temVariacoes && saldo === 0) {
          try {
            const detail = await callOlist<TinyDetail>(`/produtos/${encodeURIComponent(entry.tinyId)}`);
            const variationResult = sumValidVariationStock(detail);

            if (variationResult.valid) {
              tinyStock = variationResult.total;
              fonte = "variacoes.estoque.quantidade";
              confirmadoPorDetalhe = true;
            } else {
              // Não há confirmação suficiente para substituir um estoque existente
              // por zero. Preservamos o que já está no site.
              tinyStock = null;
              fonte = "preservado-sem-confirmacao";
            }
          } catch (detailError) {
            const message = detailError instanceof Error ? detailError.message : String(detailError);
            if (/429|too many|rate limit/i.test(message)) rateLimited += 1;
            tinyStock = null;
            fonte = "preservado-falha-consulta-complementar";
          }
        }

        if (tinyStock == null) {
          preservados += 1;
          diagnosticos.push({
            siteId: existing.id,
            tinyId: entry.tinyId,
            nome: existing.nome,
            siteStockBefore: existing.estoque,
            tinyStock: null,
            estoqueMudou: false,
            fonte,
            erro: "Estoque não confirmado; produto preservado.",
          });
          processados += 1;
          continue;
        }

        // O botão de sincronização de estoque altera APENAS o estoque total.
        // Não tocamos em tamanhos, cores ou matriz para não sobrescrever dados
        // válidos do site com dados de variação que não estejam confirmados.
        await prisma.produto.update({
          where: { id: existing.id },
          data: { estoque: tinyStock },
        });

        const changed = Number(existing.estoque) !== tinyStock;
        atualizados += 1;
        if (changed) estoqueAlterado += 1;

        diagnosticos.push({
          siteId: existing.id,
          tinyId: entry.tinyId,
          nome: existing.nome,
          siteStockBefore: existing.estoque,
          tinyStock,
          estoqueMudou: changed,
          fonte,
          confirmadoPorDetalhe,
        });
        processados += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/429|too many|rate limit/i.test(message)) rateLimited += 1;
        falhas += 1;
        processados += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome,
          siteStockBefore: entry.siteStockBefore,
          tinyStock: null,
          estoqueMudou: false,
          erro: message,
          rateLimited: /429|too many|rate limit/i.test(message),
        });
        console.error(`[Olist V3] Falha ao sincronizar estoque ${entry.tinyId}:`, error);
      }
    }

    return {
      success: true,
      mode: "stock-batch",
      atualizados,
      estoqueAlterado,
      preservados,
      falhas,
      rateLimited,
      processados,
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
    const body = (await request.json().catch(() => ({}))) as AnyRecord;
    const mode = str(body.mode || body.action || "prepare-stock").toLowerCase();

    if (mode === "prepare-stock" || mode === "prepare-quick") {
      return NextResponse.json(await prepareStock());
    }

    if (mode === "stock-batch" || mode === "quick" || mode === "sync") {
      const entries: SiteStockEntry[] = Array.isArray(body.entries)
        ? body.entries
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              siteId: str(entry.siteId),
              tinyId: str(entry.tinyId),
              nome: str(entry.nome),
              siteStockBefore: Number(entry.siteStockBefore || 0),
              temVariacoes: Boolean(entry.temVariacoes),
            }))
            .filter((entry) => Boolean(entry.siteId && entry.tinyId))
        : [];

      if (entries.length === 0) {
        return NextResponse.json(
          { success: false, error: "Nenhum produto foi enviado para sincronização de estoque." },
          { status: 400 }
        );
      }

      return NextResponse.json(await stockBatch(entries));
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
        { status: error.code === "NOT_CONNECTED" ? 401 : 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno ao sincronizar estoque.",
      },
      { status: 500 }
    );
  }
}
