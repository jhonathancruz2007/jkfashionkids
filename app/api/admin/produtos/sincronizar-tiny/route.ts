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
const STOCK_PACE_KEY = "jkfashion:olist:v3:stock-sync:next-at";
const DEFAULT_BATCH_SIZE = 6;
const STOCK_INTERVAL_MS = 2200;
const MAX_RETRIES_429 = 2;

// Este endpoint é deliberadamente exclusivo para ESTOQUE.
// Produtos novos, preço, imagens, categoria e faixa etária não são alterados aqui.
type StockEntry = {
  siteId: string;
  tinyId: string;
  nome?: string;
};

type TinyStockResponse = {
  id?: number;
  nome?: string;
  codigo?: string;
  unidade?: string;
  saldo?: number;
  reservado?: number;
  disponivel?: number;
  depositos?: Array<{
    id?: number;
    nome?: string;
    desconsiderar?: boolean;
    saldo?: number;
    reservado?: number;
    disponivel?: number;
  }>;
};

type Diagnose = {
  siteId: string;
  tinyId: string;
  nome: string;
  siteStockBefore: number;
  tinySaldo: number | null;
  tinyDisponivel: number | null;
  estoqueMudou: boolean;
  status: "atualizado" | "igual" | "falhou";
  erro?: string;
  rateLimited?: boolean;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ok = await redisSetNx(SYNC_LOCK_KEY, owner, 90);
  if (!ok) {
    throw new Error("Já existe uma sincronização de estoque em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

/**
 * Garante no máximo aproximadamente 27 chamadas/minuto feitas por esta rotina.
 * A chave fica no Redis para que lotes consecutivos do navegador compartilhem
 * o mesmo relógio e não reiniciem o espaçamento a cada requisição.
 */
async function waitForGlobalPace() {
  const now = Date.now();
  const nextAt = await redisGetJson<number>(STOCK_PACE_KEY).catch(() => null);
  if (nextAt && nextAt > now) {
    await sleep(nextAt - now);
  }
  await redisSetJson(STOCK_PACE_KEY, Date.now() + STOCK_INTERVAL_MS, 90);
}

async function getStockAuthoritative(tinyId: string): Promise<TinyStockResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt += 1) {
    await waitForGlobalPace();

    try {
      // O endpoint /estoque/{idProduto} é a fonte específica de estoque da API V3.
      return await getOlistV3<TinyStockResponse>(
        `/estoque/${encodeURIComponent(tinyId)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited = message.includes("HTTP 429") || message.includes("API 429");
      if (!rateLimited || attempt >= MAX_RETRIES_429) {
        throw error;
      }

      // O limite é por conta. Uma espera progressiva evita repetir imediatamente
      // uma chamada que acabou de ser recusada.
      await sleep(5000 * (attempt + 1));
    }
  }

  throw new Error("Não foi possível consultar o estoque no Olist/Tiny.");
}

async function prepareStock() {
  const products = await prisma.produto.findMany({
    select: { id: true, nome: true },
    orderBy: { id: "asc" },
  });

  return {
    success: true,
    mode: "prepare-stock",
    entries: products.map((product) => ({
      siteId: String(product.id),
      // No seu catálogo atual, o ID do produto do site é o mesmo ID usado
      // pelo produto no Olist/Tiny. O log que você trouxe confirmou isso.
      tinyId: String(product.id),
      nome: String(product.nome || ""),
    })),
    total: products.length,
    batchSize: DEFAULT_BATCH_SIZE,
  };
}

async function processBatch(entries: StockEntry[]) {
  const clean = entries
    .filter((entry) => entry && str(entry.siteId) && str(entry.tinyId))
    .slice(0, DEFAULT_BATCH_SIZE);

  if (clean.length === 0) {
    return {
      success: true,
      mode: "stock-batch",
      processados: 0,
      atualizados: 0,
      estoqueAlterado: 0,
      mantidos: 0,
      falhas: 0,
      diagnosticos: [],
    };
  }

  return withLock(async () => {
    let atualizados = 0;
    let estoqueAlterado = 0;
    let mantidos = 0;
    let falhas = 0;
    const diagnosticos: Diagnose[] = [];

    // Uma chamada por vez. Isso é intencional: a conta tem limite de 30 leituras/minuto.
    for (const entry of clean) {
      const existing = await prisma.produto.findUnique({
        where: { id: entry.siteId },
        select: { id: true, estoque: true },
      });

      if (!existing) {
        continue;
      }

      try {
        const stock = await getStockAuthoritative(entry.tinyId);
        const saldo = finiteNumber(stock?.saldo);
        const disponivel = finiteNumber(stock?.disponivel);

        // Nunca tratamos campo ausente como zero.
        if (saldo == null || saldo < 0) {
          throw new Error(
            `Olist/Tiny não retornou saldo físico válido para o produto ${entry.tinyId}.`
          );
        }

        const tinySaldo = Math.round(saldo);
        const changed = existing.estoque !== tinySaldo;

        if (changed) {
          await prisma.produto.update({
            where: { id: existing.id },
            data: { estoque: tinySaldo },
          });
          estoqueAlterado += 1;
        } else {
          mantidos += 1;
        }

        atualizados += 1;
        diagnosticos.push({
          siteId: String(existing.id),
          tinyId: String(entry.tinyId),
          nome: str(stock.nome) || str(entry.nome),
          siteStockBefore: existing.estoque,
          tinySaldo,
          tinyDisponivel: disponivel == null ? null : Math.round(disponivel),
          estoqueMudou: changed,
          status: changed ? "atualizado" : "igual",
        });
      } catch (error) {
        falhas += 1;
        const message = error instanceof Error ? error.message : String(error);
        diagnosticos.push({
          siteId: String(existing.id),
          tinyId: String(entry.tinyId),
          nome: str(entry.nome),
          siteStockBefore: existing.estoque,
          tinySaldo: null,
          tinyDisponivel: null,
          estoqueMudou: false,
          status: "falhou",
          erro: message,
          rateLimited: message.includes("HTTP 429") || message.includes("API 429"),
        });
      }
    }

    return {
      success: true,
      mode: "stock-batch",
      processados: clean.length,
      atualizados,
      estoqueAlterado,
      mantidos,
      falhas,
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

    if (mode === "prepare-stock" || mode === "prepare") {
      try {
        return NextResponse.json(await prepareStock());
      } catch (error) {
        if (error instanceof OlistOAuthError) throw error;
        throw error;
      }
    }

    if (mode === "stock" || mode === "stock-batch") {
      const entries = Array.isArray(body.entries)
        ? body.entries.map((entry) => ({
            siteId: str((entry as Record<string, unknown>)?.siteId),
            tinyId: str((entry as Record<string, unknown>)?.tinyId),
            nome: str((entry as Record<string, unknown>)?.nome),
          }))
        : [];

      if (entries.length === 0) {
        return NextResponse.json(
          { success: false, error: "Nenhum produto foi enviado para sincronização de estoque." },
          { status: 400 }
        );
      }

      return NextResponse.json(await processBatch(entries));
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
        { status: error.code === "NOT_CONNECTED" ? 401 : 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar estoque.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
