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

// O plano Construa possui limite de 30 leituras/minuto por conta.
// Uma chamada a cada 2,5s mantém margem e evita o burst que estava causando 429.
const STOCK_REQUEST_INTERVAL_MS = 2500;
const STOCK_BATCH_SIZE = 10;

// A sincronização desta rota é deliberadamente focada em ESTOQUE.
// Não consulta catálogo do Tiny, não altera preço/descrição/imagem/categoria/faixa etária
// e não reescreve a matriz de tamanho/cor.

type AnyRecord = Record<string, any>;

type SiteStockEntry = {
  siteId: string;
  tinyId: string;
  nome: string;
  siteStockBefore: number;
  tamanhos: string[];
  cores: string[];
};

type TinyStockResponse = {
  id?: number | null;
  nome?: string | null;
  codigo?: string | null;
  unidade?: string | null;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
  localizacao?: string | null;
  depositos?: Array<{
    id?: number | null;
    nome?: string | null;
    desconsiderar?: boolean | null;
    saldo?: number | null;
    reservado?: number | null;
    disponivel?: number | null;
  }> | null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const locked = await redisSetNx(SYNC_LOCK_KEY, owner, 120);

  if (!locked) {
    throw new Error("Já existe uma sincronização de estoque em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

function normalizeEntries(value: unknown): SiteStockEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry: AnyRecord) => ({
      siteId: str(entry.siteId),
      tinyId: str(entry.tinyId || entry.siteId),
      nome: str(entry.nome || entry.nomeSite || entry.nomeTiny),
      siteStockBefore: safeStock(entry.siteStockBefore) ?? 0,
      tamanhos: Array.isArray(entry.tamanhos) ? entry.tamanhos.map(str).filter(Boolean) : [],
      cores: Array.isArray(entry.cores) ? entry.cores.map(str).filter(Boolean) : [],
    }))
    .filter((entry) => Boolean(entry.siteId && entry.tinyId));
}

function extractTinyStock(data: TinyStockResponse): { quantity: number | null; source: string } {
  const saldo = safeStock(data?.saldo);
  if (saldo != null) return { quantity: saldo, source: "saldo" };

  // Fallback apenas se saldo não vier no payload. Nunca tratamos ausência como zero.
  const disponivel = safeStock(data?.disponivel);
  if (disponivel != null) return { quantity: disponivel, source: "disponivel" };

  return { quantity: null, source: "nenhum" };
}

async function getTinyStock(tinyId: string): Promise<TinyStockResponse> {
  return getOlistV3<TinyStockResponse>(`/estoque/${encodeURIComponent(tinyId)}`);
}

async function prepareStock() {
  const siteProducts = await prisma.produto.findMany({
    select: {
      id: true,
      nome: true,
      estoque: true,
      tamanhos: true,
      cores: true,
    },
    orderBy: { id: "asc" },
  });

  const entries: SiteStockEntry[] = siteProducts.map((product) => ({
    siteId: String(product.id),
    // Seus produtos atuais usam o mesmo ID numérico do cadastro correspondente no Tiny.
    // Não fazemos mais associação por nome nem consulta do catálogo para a sincronização de estoque.
    tinyId: String(product.id),
    nome: String(product.nome || ""),
    siteStockBefore: Number(product.estoque || 0),
    tamanhos: Array.isArray(product.tamanhos) ? product.tamanhos : [],
    cores: Array.isArray(product.cores) ? product.cores : [],
  }));

  return {
    success: true,
    mode: "prepare-stock",
    entries,
    total: entries.length,
    batchSize: STOCK_BATCH_SIZE,
  };
}

async function stockBatch(entries: SiteStockEntry[]) {
  const cleanEntries = normalizeEntries(entries).slice(0, STOCK_BATCH_SIZE);

  if (cleanEntries.length === 0) {
    return {
      success: true,
      mode: "stock-batch",
      atualizados: 0,
      estoqueAlterado: 0,
      estoqueIgual: 0,
      falhas: 0,
      processados: 0,
      rateLimited: false,
      diagnosticos: [],
    };
  }

  return withSyncLock(async () => {
    let atualizados = 0;
    let estoqueAlterado = 0;
    let estoqueIgual = 0;
    let falhas = 0;
    let rateLimited = false;
    const diagnosticos: Array<Record<string, unknown>> = [];

    for (let index = 0; index < cleanEntries.length; index += 1) {
      const entry = cleanEntries[index];

      // Espaçamento também antes da primeira chamada do lote. Isso mantém a distância
      // entre a última chamada do lote anterior e a primeira desta invocação.
      await sleep(STOCK_REQUEST_INTERVAL_MS);

      try {
        const stock = await getTinyStock(entry.tinyId);
        const extracted = extractTinyStock(stock);

        if (extracted.quantity == null) {
          falhas += 1;
          diagnosticos.push({
            siteId: entry.siteId,
            tinyId: entry.tinyId,
            nome: entry.nome,
            siteStockBefore: entry.siteStockBefore,
            tinyStock: null,
            estoqueMudou: false,
            erro: "O endpoint de estoque não retornou saldo/disponível válido. Produto preservado.",
            fonte: extracted.source,
            rateLimited: false,
          });
          continue;
        }

        const changed = entry.siteStockBefore !== extracted.quantity;

        if (changed) {
          await prisma.produto.update({
            where: { id: entry.siteId },
            data: {
              // ÚNICO campo alterado por esta sincronização.
              estoque: extracted.quantity,
            },
          });
          estoqueAlterado += 1;
        } else {
          estoqueIgual += 1;
        }

        atualizados += 1;

        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome,
          siteStockBefore: entry.siteStockBefore,
          tinyStock: extracted.quantity,
          estoqueMudou: changed,
          fonte: extracted.source,
          rateLimited: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const is429 = /API 429|HTTP 429|429/i.test(message);

        if (is429) {
          rateLimited = true;
          falhas += 1;
          diagnosticos.push({
            siteId: entry.siteId,
            tinyId: entry.tinyId,
            nome: entry.nome,
            siteStockBefore: entry.siteStockBefore,
            tinyStock: null,
            estoqueMudou: false,
            erro: message,
            rateLimited: true,
          });

          // Para imediatamente. Não pula produtos e não tenta compensar um 429
          // disparando mais chamadas. Os já processados permanecem gravados;
          // este e os seguintes ficam para uma nova tentativa segura.
          break;
        }

        falhas += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome,
          siteStockBefore: entry.siteStockBefore,
          tinyStock: null,
          estoqueMudou: false,
          erro: message,
          rateLimited: false,
        });
      }
    }

    const processados = diagnosticos.length;

    return {
      success: true,
      mode: "stock-batch",
      atualizados,
      estoqueAlterado,
      estoqueIgual,
      falhas,
      processados,
      rateLimited,
      retryAfterMs: rateLimited ? 60000 : 0,
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
      const entries = normalizeEntries(body.entries);

      if (entries.length === 0) {
        return NextResponse.json(
          { success: false, error: "Nenhum produto foi enviado para sincronização de estoque." },
          { status: 400 }
        );
      }

      const result = await stockBatch(entries);

      if (result.rateLimited) {
        return NextResponse.json(result, { status: 429 });
      }

      return NextResponse.json(result);
    }

    // Compatibilidade: a reconciliação completa passa a executar a mesma lógica segura de estoque.
    if (mode === "prepare-full") {
      return NextResponse.json(await prepareStock());
    }

    if (mode === "full-batch") {
      const entries = normalizeEntries(body.entries);
      if (entries.length === 0) {
        return NextResponse.json(
          { success: false, error: "Nenhum produto foi enviado para reconciliação de estoque." },
          { status: 400 }
        );
      }

      const result = await stockBatch(entries);
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

    const message = error instanceof Error ? error.message : "Erro interno na sincronização.";
    const is429 = /API 429|HTTP 429|429/i.test(message);

    return NextResponse.json(
      {
        success: false,
        error: message,
        rateLimited: is429,
      },
      { status: is429 ? 429 : 500 }
    );
  }
}
