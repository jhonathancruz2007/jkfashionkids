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
const API_CALL_INTERVAL_MS = 2900;

// O endpoint oficial de estoque da API V3 retorna saldo, reservado e disponível.
// Para o campo estoque do site usamos SALDO, isto é, o estoque físico informado
// pela Olist/Tiny. Não usamos o estoque do cadastro do produto para isso.
type OlistStockResponse = {
  id?: number;
  nome?: string;
  codigo?: string;
  unidade?: string;
  saldo?: number | string | null;
  reservado?: number | string | null;
  disponivel?: number | string | null;
  localizacao?: string | null;
  depositos?: Array<{
    id?: number;
    nome?: string;
    desconsiderar?: boolean;
    saldo?: number | string | null;
    reservado?: number | string | null;
    disponivel?: number | string | null;
    empresa?: string | null;
  }>;
};

type StockEntry = {
  siteId: string;
  tinyId: string;
  nome?: string;
  siteStockBefore?: number | null;
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

function asInt(value: unknown): number | null {
  const parsed = num(value);
  if (parsed == null || parsed < 0) return null;
  return Math.round(parsed);
}

function normalizeEntry(value: unknown): StockEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const siteId = str(entry.siteId);
  const tinyId = str(entry.tinyId || entry.siteId);
  if (!siteId || !tinyId) return null;

  const rawBefore = num(entry.siteStockBefore);

  return {
    siteId,
    tinyId,
    nome: str(entry.nome) || undefined,
    siteStockBefore: rawBefore,
  };
}

function isRateLimitError(error: unknown): boolean {
  return /API 429|HTTP 429|429/i.test(error instanceof Error ? error.message : String(error));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

let lastTinyApiCallAt = 0;

async function waitGlobalInterval(): Promise<void> {
  const elapsed = Date.now() - lastTinyApiCallAt;
  const wait = API_CALL_INTERVAL_MS - elapsed;
  if (wait > 0) await sleep(wait);
  lastTinyApiCallAt = Date.now();
}

async function getTinyIdForSite(siteId: string, fallbackTinyId: string): Promise<string> {
  try {
    const stored = await redisGetJson<string>(`${SITE_TINY_MAP_PREFIX}${siteId}`);
    return str(stored) || fallbackTinyId;
  } catch {
    return fallbackTinyId;
  }
}

async function getExactStock(tinyId: string): Promise<OlistStockResponse> {
  await waitGlobalInterval();
  return getOlistV3<OlistStockResponse>(`/estoque/${encodeURIComponent(tinyId)}`);
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const locked = await redisSetNx(SYNC_LOCK_KEY, owner, 30);
  if (!locked) {
    throw new Error("Já existe uma sincronização de estoque em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

async function processStockBatch(entries: StockEntry[]) {
  let atualizados = 0;
  let estoqueAlterado = 0;
  let confirmados = 0;
  let falhas = 0;
  let rateLimited = false;
  let retryAfterMs = 60000;

  const diagnosticos: Array<Record<string, unknown>> = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];

    try {
      const tinyId = await getTinyIdForSite(entry.siteId, entry.tinyId);
      const stock = await getExactStock(tinyId);

      // O saldo precisa existir como número válido. Zero é válido e significa
      // estoque zero confirmado pela API de estoque; ausência de saldo não é.
      const saldo = asInt(stock.saldo);
      const reservado = asInt(stock.reservado);
      const disponivel = asInt(stock.disponivel);

      if (saldo == null) {
        throw new Error(
          `A API de estoque do produto ${tinyId} não retornou um saldo numérico. Produto preservado.`
        );
      }

      const existing = await prisma.produto.findUnique({
        where: { id: entry.siteId },
        select: { id: true, estoque: true },
      });

      if (!existing) {
        falhas += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId,
          nome: entry.nome || "",
          siteStockBefore: entry.siteStockBefore ?? null,
          tinySaldo: saldo,
          tinyDisponivel: disponivel,
          tinyReservado: reservado,
          estoqueMudou: false,
          erro: "Produto não encontrado no site; nenhuma alteração realizada.",
        });
        continue;
      }

      const changed = existing.estoque !== saldo;

      // MUITO IMPORTANTE: nesta sincronização alteramos somente `estoque`.
      // Nenhum preço, descrição, imagem, categoria, faixa etária ou matriz
      // de tamanho/cor é tocado.
      await prisma.produto.update({
        where: { id: existing.id },
        data: { estoque: saldo },
      });

      atualizados += 1;
      confirmados += 1;
      if (changed) estoqueAlterado += 1;

      diagnosticos.push({
        siteId: existing.id,
        tinyId,
        nome: entry.nome || stock.nome || "",
        siteStockBefore: existing.estoque,
        tinySaldo: saldo,
        tinyDisponivel: disponivel,
        tinyReservado: reservado,
        estoqueMudou: changed,
        fonte: "GET /estoque/{idProduto}",
      });
    } catch (error) {
      if (isRateLimitError(error)) {
        rateLimited = true;
        retryAfterMs = 60000;
        falhas += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome || "",
          siteStockBefore: entry.siteStockBefore ?? null,
          estoqueMudou: false,
          erro: error instanceof Error ? error.message : String(error),
          rateLimited: true,
        });
        break;
      }

      falhas += 1;
      diagnosticos.push({
        siteId: entry.siteId,
        tinyId: entry.tinyId,
        nome: entry.nome || "",
        siteStockBefore: entry.siteStockBefore ?? null,
        estoqueMudou: false,
        erro: error instanceof Error ? error.message : String(error),
        rateLimited: false,
      });
    }
  }

  return {
    success: true,
    mode: "stock-batch",
    atualizados,
    estoqueAlterado,
    confirmados,
    falhas,
    processados: diagnosticos.length,
    rateLimited,
    retryAfterMs,
    diagnosticos,
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = str(body.mode || "stock-batch").toLowerCase();

    if (mode !== "stock-batch" && mode !== "stock") {
      return NextResponse.json(
        { success: false, error: "Esta rota está configurada para sincronização de estoque." },
        { status: 400 }
      );
    }

    const entries = Array.isArray(body.entries)
      ? body.entries.map(normalizeEntry).filter(Boolean) as StockEntry[]
      : [];

    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum produto foi enviado para sincronização de estoque." },
        { status: 400 }
      );
    }

    // Limite pequeno por chamada para caber confortavelmente no maxDuration
    // mesmo com o intervalo entre requisições ao Tiny.
    const lote = entries.slice(0, 6);

    return NextResponse.json(await withSyncLock(() => processStockBatch(lote)));
  } catch (error) {
    console.error("=== ERRO NA SINCRONIZAÇÃO DE ESTOQUE OLIST/TINY V3 ===");
    console.error(error);

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

    if (isRateLimitError(error)) {
      return NextResponse.json(
        {
          success: false,
          rateLimited: true,
          retryAfterMs: 12000,
          error: error instanceof Error ? error.message : "Limite da API Olist/Tiny atingido.",
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
