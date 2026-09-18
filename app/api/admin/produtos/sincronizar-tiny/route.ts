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

const SYNC_LOCK_KEY = "jkfashion:olist:v3:sync:stock-lock";
const BATCH_SIZE = 5;
const LOCK_TTL_SECONDS = 90;

type AnyRecord = Record<string, unknown>;

type SyncEntry = {
  siteId: string;
  tinyId: string;
  nomeSite?: string;
};

type TinyStockResponse = {
  id?: number | string;
  nome?: string;
  codigo?: string;
  saldo?: number | string | null;
  reservado?: number | string | null;
  disponivel?: number | string | null;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function safeStock(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }

  if (value == null || value === "") return null;

  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await redisSetNx(SYNC_LOCK_KEY, owner, LOCK_TTL_SECONDS);

  if (!acquired) {
    throw new Error("Já existe uma sincronização de estoque em andamento. Aguarde terminar.");
  }

  try {
    return await fn();
  } finally {
    await redisDelete(SYNC_LOCK_KEY).catch(() => undefined);
  }
}

/**
 * O saldo usado pelo site vem do endpoint específico de Estoque da V3.
 * Esse endpoint retorna `saldo` explicitamente; zero é um valor válido quando
 * o próprio Olist/Tiny devolve zero.
 */
async function getAuthoritativeStock(tinyId: string): Promise<TinyStockResponse> {
  return getOlistV3<TinyStockResponse>(
    `/estoque/${encodeURIComponent(tinyId)}`
  );
}

/**
 * Prepara somente os vínculos de estoque usando o ID do produto do site.
 * Nos produtos atuais da JKfashion, esse ID é o mesmo ID do produto no Tiny,
 * como já confirmado nos diagnósticos anteriores.
 *
 * Importante: esta etapa NÃO faz nenhuma chamada à API V3.
 */
async function prepareStock(): Promise<AnyRecord> {
  const produtos = await prisma.produto.findMany({
    select: {
      id: true,
      nome: true,
      estoque: true,
    },
    orderBy: {
      nome: "asc",
    },
  });

  const entries: SyncEntry[] = produtos.map((produto) => ({
    siteId: String(produto.id),
    tinyId: String(produto.id),
    nomeSite: String(produto.nome || ""),
  }));

  return {
    success: true,
    mode: "prepare-stock",
    entries,
    total: entries.length,
    batchSize: BATCH_SIZE,
  };
}

async function stockBatch(entries: SyncEntry[]) {
  const cleanEntries = entries
    .filter((entry) => entry && str(entry.siteId) && str(entry.tinyId))
    .slice(0, BATCH_SIZE)
    .map((entry) => ({
      siteId: str(entry.siteId),
      tinyId: str(entry.tinyId),
      nomeSite: str(entry.nomeSite),
    }));

  if (cleanEntries.length === 0) {
    return {
      success: true,
      mode: "stock-batch",
      processados: 0,
      atualizados: 0,
      estoqueAlterado: 0,
      falhas: 0,
      ignorados: 0,
      rateLimited: false,
      diagnosticos: [],
    };
  }

  return withSyncLock(async () => {
    // Busca os produtos do site de uma vez, sem gastar chamadas da API V3.
    const ids = cleanEntries.map((entry) => entry.siteId);
    const existentes = await prisma.produto.findMany({
      where: { id: { in: ids } },
      select: { id: true, estoque: true },
    });
    const existingMap = new Map(
      existentes.map((produto) => [String(produto.id), produto])
    );

    let processados = 0;
    let atualizados = 0;
    let estoqueAlterado = 0;
    let falhas = 0;
    let ignorados = 0;
    let rateLimited = false;
    const diagnosticos: Array<Record<string, unknown>> = [];

    // Intencionalmente sequencial: evita rajadas de requisições que já
    // provocaram HTTP 429 na sua conta Construa.
    for (const entry of cleanEntries) {
      const existente = existingMap.get(entry.siteId);

      if (!existente) {
        ignorados += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nomeSite,
          siteStockBefore: null,
          tinyStock: null,
          estoqueMudou: false,
          erro: "Produto não encontrado no banco do site.",
          rateLimited: false,
        });
        continue;
      }

      try {
        const stock = await getAuthoritativeStock(entry.tinyId);
        const tinyStock = safeStock(stock?.saldo);

        // Sem saldo explícito, não alteramos nada. Ausência != zero.
        if (tinyStock == null) {
          falhas += 1;
          diagnosticos.push({
            siteId: entry.siteId,
            tinyId: entry.tinyId,
            nome: entry.nomeSite,
            siteStockBefore: existente.estoque,
            tinyStock: null,
            estoqueMudou: false,
            erro: "Olist/Tiny não devolveu um saldo válido. Estoque preservado.",
            rateLimited: false,
          });
          continue;
        }

        const changed = existente.estoque !== tinyStock;

        // REGRA PRINCIPAL: somente o estoque total do site é atualizado.
        // Não tocamos em tamanho, cor, categoria, faixa etária, preço,
        // descrição ou imagens.
        if (changed) {
          await prisma.produto.update({
            where: { id: entry.siteId },
            data: { estoque: tinyStock },
          });
          estoqueAlterado += 1;
        }

        atualizados += 1;
        processados += 1;

        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nomeSite,
          siteStockBefore: existente.estoque,
          tinyStock,
          estoqueMudou: changed,
          erro: "",
          rateLimited: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const is429 = /\b429\b|rate.?limit/i.test(message);
        if (is429) rateLimited = true;

        falhas += 1;
        diagnosticos.push({
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nomeSite,
          siteStockBefore: existente.estoque,
          tinyStock: null,
          estoqueMudou: false,
          erro: message,
          rateLimited: is429,
        });

        // Se a conta atingiu o limite, não fazemos novas chamadas nesta
        // mesma requisição. Isso evita transformar um 429 em uma rajada de
        // novos 429.
        if (is429) break;
      }
    }

    return {
      success: true,
      mode: "stock-batch",
      processados,
      atualizados,
      estoqueAlterado,
      falhas,
      ignorados,
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
    const rawMode = str(body.mode || body.action || "stock-batch").toLowerCase();

    // Compatibilidade com a versão do frontend que já está publicada e envia
    // prepare-stock. Também aceitamos prepare-quick para evitar outro 400.
    if (rawMode === "prepare-stock" || rawMode === "prepare-quick" || rawMode === "prepare") {
      return NextResponse.json(await withSyncLock(prepareStock));
    }

    if (rawMode === "stock-batch" || rawMode === "quick" || rawMode === "sync") {
      const entries: SyncEntry[] = Array.isArray(body.entries)
        ? body.entries
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              siteId: str((entry as AnyRecord).siteId),
              tinyId: str((entry as AnyRecord).tinyId),
              nomeSite: str((entry as AnyRecord).nomeSite),
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

      return NextResponse.json(await stockBatch(entries));
    }

    return NextResponse.json(
      {
        success: false,
        error: `Modo de sincronização inválido: ${rawMode}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("=== ERRO NA SINCRONIZAÇÃO DE ESTOQUE OLIST/TINY V3 ===");
    console.error(error);

    if (error instanceof OlistOAuthError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.code === "NOT_CONNECTED" ? 401 : 500 }
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
