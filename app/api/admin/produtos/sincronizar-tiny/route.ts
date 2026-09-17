import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  OlistOAuthError,
  getOlistV3,
} from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type AnyRecord = Record<string, any>;

type StockEntry = {
  siteId: string;
  tinyId: string;
  nome?: string;
};

type TinyStockResponse = {
  id?: number;
  nome?: string | null;
  codigo?: string | null;
  unidade?: string | null;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
  localizacao?: string | null;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function nonNegativeStock(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:HTTP\s*429|API\s*429|\b429\b|rate.?limit|muitas requisi)/i.test(message);
}

async function getStock(tinyId: string): Promise<TinyStockResponse> {
  if (!/^\d+$/.test(tinyId)) {
    throw new Error(`ID Tiny inválido: ${tinyId}`);
  }

  return getOlistV3<TinyStockResponse>(
    `/estoque/${encodeURIComponent(tinyId)}`,
    {
      signal: AbortSignal.timeout(15000),
    }
  );
}

async function stockOnlyBatch(entries: StockEntry[]) {
  const cleanEntries = entries
    .filter(
      (entry) =>
        entry &&
        /^\d+$/.test(str(entry.tinyId)) &&
        /^\d+$/.test(str(entry.siteId))
    )
    .slice(0, 28);

  let atualizados = 0;
  let estoqueAlterado = 0;
  let semAlteracao = 0;
  let falhas = 0;
  let rateLimited = 0;
  let processados = 0;
  const diagnosticos: Array<Record<string, unknown>> = [];

  // Cada item faz exatamente UMA leitura no endpoint oficial de estoque.
  // Não há lock Redis aqui: o frontend já serializa os lotes e um lock preso
  // não deve transformar uma sincronização válida em HTTP 500.
  const results = await Promise.allSettled(
    cleanEntries.map(async (entry) => {
      const existing = await prisma.produto.findUnique({
        where: { id: str(entry.siteId) },
        select: { id: true, estoque: true },
      });

      if (!existing) {
        return {
          kind: "ignored" as const,
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome,
          motivo: "Produto não encontrado no site.",
        };
      }

      const stock = await getStock(entry.tinyId);

      // O endpoint oficial retorna SALDO físico. Como o pedido aqui é alinhar
      // o campo estoque da loja ao estoque do Tiny, usamos saldo, não o detalhe
      // do produto e não a soma das variações.
      const saldo = nonNegativeStock(stock?.saldo);

      // Nunca transformar campo ausente em 0.
      if (saldo == null) {
        return {
          kind: "failed" as const,
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome || stock?.nome || "",
          motivo: "O Tiny não retornou um saldo numérico válido; estoque preservado.",
        };
      }

      const mudou = existing.estoque !== saldo;

      await prisma.produto.update({
        where: { id: existing.id },
        data: { estoque: saldo },
      });

      return {
        kind: "updated" as const,
        siteId: existing.id,
        tinyId: entry.tinyId,
        nome: entry.nome || stock?.nome || "",
        siteStockBefore: existing.estoque,
        tinyStock: saldo,
        estoqueMudou: mudou,
      };
    })
  );

  for (let i = 0; i < results.length; i++) {
    processados += 1;
    const result = results[i];
    const entry = cleanEntries[i];

    if (result.status === "fulfilled") {
      if (result.value.kind === "updated") {
        atualizados += 1;
        if (result.value.estoqueMudou) estoqueAlterado += 1;
        else semAlteracao += 1;
        diagnosticos.push({
          siteId: result.value.siteId,
          tinyId: result.value.tinyId,
          nome: result.value.nome,
          siteStockBefore: result.value.siteStockBefore,
          tinyStock: result.value.tinyStock,
          estoqueMudou: result.value.estoqueMudou,
        });
      } else {
        falhas += 1;
        diagnosticos.push({
          siteId: result.value.siteId,
          tinyId: result.value.tinyId,
          nome: result.value.nome,
          erro: result.value.motivo,
        });
      }
      continue;
    }

    const error = result.reason;
    if (isRateLimitError(error)) rateLimited += 1;
    else falhas += 1;

    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Olist V3] Falha no estoque ${entry?.tinyId}:`, error);
    diagnosticos.push({
      siteId: entry?.siteId,
      tinyId: entry?.tinyId,
      nome: entry?.nome,
      erro: message,
      rateLimited: isRateLimitError(error),
    });
  }

  return {
    success: true,
    mode: "stock-only-batch",
    atualizados,
    estoqueAlterado,
    semAlteracao,
    falhas,
    rateLimited,
    processados,
    diagnosticos,
  };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    mode: "stock-only-v19",
    fonteEstoque: "GET /estoque/{idProduto}",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnyRecord;
    const mode = str(body.mode || body.action || "").toLowerCase();

    if (mode !== "stock-only-batch") {
      return NextResponse.json(
        {
          success: false,
          error: "Esta rota foi simplificada para sincronização de estoque. Use mode=stock-only-batch.",
        },
        { status: 400 }
      );
    }

    const entries: StockEntry[] = Array.isArray(body.entries)
      ? body.entries
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            siteId: str(entry.siteId),
            tinyId: str(entry.tinyId),
            nome: str(entry.nome),
          }))
      : [];

    if (entries.length === 0) {
      return NextResponse.json(
        { success: false, error: "Nenhum produto foi enviado para sincronização de estoque." },
        { status: 400 }
      );
    }

    return NextResponse.json(await stockOnlyBatch(entries));
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

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno na sincronização de estoque.",
      },
      { status: 500 }
    );
  }
}
