import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OlistOAuthError, getOlistV3 } from "@/lib/olist-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

type AnyRecord = Record<string, any>;

type TinyVariation = {
  id?: number | null;
  descricao?: string | null;
  sku?: string | null;
  estoque?: { quantidade?: number | null } | null;
  grade?: Array<{ chave?: string | null; valor?: string | null }> | null;
};

type TinyDetail = {
  id?: number | null;
  descricao?: string | null;
  tipo?: string | null;
  tipoVariacao?: string | null;
  situacao?: string | null;
  estoque?: { quantidade?: number | null } | null;
  variacoes?: TinyVariation[] | null;
};

type TinyStock = {
  id?: number | null;
  nome?: string | null;
  codigo?: string | null;
  saldo?: number | null;
  reservado?: number | null;
  disponivel?: number | null;
  depositos?: Array<{
    id?: number | null;
    nome?: string | null;
    desconsiderar?: boolean | null;
    saldo?: number | null;
    reservado?: number | null;
    disponivel?: number | null;
  }> | null;
};

type StockEntry = {
  siteId: string;
  tinyId: string;
  nome: string;
  estoqueAntes: number;
  hasVariations: boolean;
  tamanhos: string[];
  cores: string[];
};

type VariationTarget = {
  siteId: string;
  tinyId: string;
  descricao?: string;
  sku?: string;
  tamanho?: string;
  cor?: string;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function nonNegativeInt(value: unknown): number | null {
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

function parseGrade(
  grade: TinyVariation["grade"],
  descricao: string,
  knownSizes: string[],
  knownColors: string[]
): { tamanho: string; cor: string } {
  let tamanho = "";
  let cor = "";

  const sizeMap = new Map(knownSizes.map((v) => [normalize(v), v]));
  const colorMap = new Map(knownColors.map((v) => [normalize(v), v]));

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

    const nv = normalize(value);
    if (!tamanho && sizeMap.has(nv)) tamanho = sizeMap.get(nv)!;
    if (!cor && colorMap.has(nv)) cor = colorMap.get(nv)!;
  };

  if (Array.isArray(grade)) {
    for (const item of grade) inspect(item?.chave, item?.valor);
  }

  if ((!tamanho || !cor) && descricao) {
    const parts = descricao
      .split(" - ")
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts.slice(-3)) {
      const np = normalize(part);
      if (!tamanho && sizeMap.has(np)) tamanho = sizeMap.get(np)!;
      if (!cor && colorMap.has(np)) cor = colorMap.get(np)!;
    }

    if (!tamanho && !cor && parts.length >= 2) {
      // Fallback conservador apenas quando o cadastro do site já tem uma lista
      // de tamanhos/cores que permita validar os valores.
      const a = parts[parts.length - 2];
      const b = parts[parts.length - 1];
      if (sizeMap.has(normalize(a))) tamanho = sizeMap.get(normalize(a))!;
      if (colorMap.has(normalize(b))) cor = colorMap.get(normalize(b))!;
    }
  }

  return { tamanho, cor };
}

function looksRateLimited(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|too many requests|rate.?limit|limite de requisi/i.test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getProductDetail(id: string): Promise<TinyDetail> {
  return getOlistV3<TinyDetail>(`/produtos/${encodeURIComponent(id)}`);
}

async function getProductStock(id: string): Promise<TinyStock> {
  return getOlistV3<TinyStock>(`/estoque/${encodeURIComponent(id)}`);
}

async function withRedisRateWindow<T>(fn: () => Promise<T>): Promise<T> {
  // O botão no navegador já limita os lotes a 5 leituras a cada 12 s.
  // Esta função apenas serializa dentro de uma mesma execução para evitar
  // explosão de chamadas em uma única função serverless.
  return fn();
}

function buildVariationTargets(
  site: StockEntry,
  detail: TinyDetail
): VariationTarget[] {
  const variations = Array.isArray(detail.variacoes) ? detail.variacoes : [];
  return variations
    .map((variation) => {
      const id = Number(variation.id || 0);
      if (!Number.isFinite(id) || id <= 0) return null;
      const grade = parseGrade(
        variation.grade,
        str(variation.descricao),
        site.tamanhos,
        site.cores
      );
      return {
        siteId: site.siteId,
        tinyId: String(id),
        descricao: str(variation.descricao),
        sku: str(variation.sku),
        tamanho: grade.tamanho,
        cor: grade.cor,
      } satisfies VariationTarget;
    })
    .filter((x): x is VariationTarget => Boolean(x));
}

async function processInitialEntry(entry: StockEntry) {
  if (!entry.hasVariations) {
    try {
      const stock = await withRedisRateWindow(() => getProductStock(entry.tinyId));
      const saldo = nonNegativeInt(stock?.saldo);

      if (saldo == null) {
        return {
          status: "failed",
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome,
          erro: "O endpoint de estoque não retornou um saldo válido. Produto preservado.",
          rateLimited: false,
        };
      }

      return {
        status: "ready",
        siteId: entry.siteId,
        tinyId: entry.tinyId,
        nome: entry.nome,
        estoque: saldo,
        matrizCompleta: false,
      };
    } catch (error) {
      return {
        status: "failed",
        siteId: entry.siteId,
        tinyId: entry.tinyId,
        nome: entry.nome,
        erro: errorMessage(error),
        rateLimited: looksRateLimited(error),
      };
    }
  }

  try {
    const detail = await withRedisRateWindow(() => getProductDetail(entry.tinyId));
    const variations = Array.isArray(detail.variacoes) ? detail.variacoes : [];

    if (variations.length === 0) {
      // Não vamos assumir que o pai representa a grade. Neste caso, uma leitura
      // direta do estoque do pai é aceitável como fallback.
      const stock = await withRedisRateWindow(() => getProductStock(entry.tinyId));
      const saldo = nonNegativeInt(stock?.saldo);

      if (saldo == null) {
        return {
          status: "failed",
          siteId: entry.siteId,
          tinyId: entry.tinyId,
          nome: entry.nome,
          erro: "Produto marcado como variável, mas o Tiny não retornou variações nem um saldo válido. Produto preservado.",
          rateLimited: false,
        };
      }

      return {
        status: "ready",
        siteId: entry.siteId,
        tinyId: entry.tinyId,
        nome: entry.nome,
        estoque: saldo,
        matrizCompleta: false,
      };
    }

    const detailQty = variations.map((variation) => nonNegativeInt(variation.estoque?.quantidade));
    const todasValidas = detailQty.every((qty) => qty != null);
    const somaDetalhe = detailQty.reduce((acc, qty) => acc + (qty || 0), 0);

    // Quando o detalhe V3 retorna um valor útil (ao menos uma unidade), usamos
    // o dado diretamente e evitamos dezenas/centenas de leituras extras.
    // Quando todas as variações aparecem como 0, tratamos isso como suspeito e
    // confirmamos cada variação pelo endpoint oficial de estoque.
    const algumaPositiva = detailQty.some((qty) => (qty || 0) > 0);
    if (todasValidas && algumaPositiva) {
      const porTamanho: Record<string, number> = {};
      const porCor: Record<string, Record<string, number>> = {};
      let gradeCompleta = true;

      for (const variation of variations) {
        const qty = nonNegativeInt(variation.estoque?.quantidade);
        if (qty == null) {
          gradeCompleta = false;
          continue;
        }
        const grade = parseGrade(
          variation.grade,
          str(variation.descricao),
          entry.tamanhos,
          entry.cores
        );
        if (!grade.tamanho && !grade.cor) gradeCompleta = false;
        if (grade.tamanho) porTamanho[grade.tamanho] = (porTamanho[grade.tamanho] || 0) + qty;
        if (grade.cor) {
          porCor[grade.cor] ||= {};
          if (grade.tamanho) porCor[grade.cor][grade.tamanho] = qty;
        }
      }

      return {
        status: "ready",
        siteId: entry.siteId,
        tinyId: entry.tinyId,
        nome: entry.nome,
        estoque: somaDetalhe,
        estoquePorTamanho: porTamanho,
        estoquePorCor: porCor,
        matrizCompleta: gradeCompleta,
      };
    }

    const targets = buildVariationTargets(entry, detail);
    if (targets.length === 0) {
      return {
        status: "failed",
        siteId: entry.siteId,
        tinyId: entry.tinyId,
        nome: entry.nome,
        erro: "O Tiny retornou um produto com variações, mas não retornou IDs de variação válidos. Produto preservado.",
        rateLimited: false,
      };
    }

    return {
      status: "needs-variation-stock",
      siteId: entry.siteId,
      tinyId: entry.tinyId,
      nome: entry.nome,
      variationTargets: targets,
    };
  } catch (error) {
    return {
      status: "failed",
      siteId: entry.siteId,
      tinyId: entry.tinyId,
      nome: entry.nome,
      erro: errorMessage(error),
      rateLimited: looksRateLimited(error),
    };
  }
}

async function processVariationTarget(target: VariationTarget) {
  try {
    const stock = await withRedisRateWindow(() => getProductStock(target.tinyId));
    const saldo = nonNegativeInt(stock?.saldo);

    if (saldo == null) {
      return {
        status: "failed",
        siteId: target.siteId,
        tinyId: target.tinyId,
        nome: target.descricao || target.sku || target.tinyId,
        tamanho: target.tamanho || "",
        cor: target.cor || "",
        erro: "Saldo de estoque inválido para a variação. Produto preservado.",
        rateLimited: false,
      };
    }

    return {
      status: "ok",
      siteId: target.siteId,
      tinyId: target.tinyId,
      nome: target.descricao || target.sku || target.tinyId,
      tamanho: target.tamanho || "",
      cor: target.cor || "",
      saldo,
    };
  } catch (error) {
    return {
      status: "failed",
      siteId: target.siteId,
      tinyId: target.tinyId,
      nome: target.descricao || target.sku || target.tinyId,
      tamanho: target.tamanho || "",
      cor: target.cor || "",
      erro: errorMessage(error),
      rateLimited: looksRateLimited(error),
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnyRecord;
    const mode = str(body.mode || "").toLowerCase();

    if (mode === "prepare-stock") {
      const products = await prisma.produto.findMany({
        select: {
          id: true,
          nome: true,
          estoque: true,
          tamanhos: true,
          cores: true,
        },
        orderBy: { nome: "asc" },
      });

      const entries: StockEntry[] = products.map((product) => ({
        siteId: String(product.id),
        tinyId: String(product.id),
        nome: str(product.nome),
        estoqueAntes: Number(product.estoque || 0),
        hasVariations: Array.isArray(product.tamanhos) && product.tamanhos.length > 0 || Array.isArray(product.cores) && product.cores.length > 0,
        tamanhos: Array.isArray(product.tamanhos) ? product.tamanhos.map(String) : [],
        cores: Array.isArray(product.cores) ? product.cores.map(String) : [],
      }));

      return NextResponse.json({
        success: true,
        mode: "prepare-stock",
        entries,
        total: entries.length,
        batchSize: 5,
        intervaloMs: 12000,
      });
    }

    if (mode === "stock-batch") {
      const entries = Array.isArray(body.entries)
        ? (body.entries as StockEntry[]).slice(0, 5)
        : [];

      if (!entries.length) {
        return NextResponse.json(
          { success: false, error: "Nenhum produto foi enviado para leitura de estoque." },
          { status: 400 }
        );
      }

      // Sequencial dentro do lote: 5 leituras e o navegador aguarda 12 s para o
      // próximo lote. Isso fica em torno de 25 leituras/minuto, deixando margem.
      const updates: any[] = [];
      for (const entry of entries) {
        updates.push(await processInitialEntry(entry));
      }

      return NextResponse.json({
        success: true,
        mode: "stock-batch",
        updates,
      });
    }

    if (mode === "variation-stock-batch") {
      const targets = Array.isArray(body.targets)
        ? (body.targets as VariationTarget[]).slice(0, 5)
        : [];

      if (!targets.length) {
        return NextResponse.json(
          { success: false, error: "Nenhuma variação foi enviada para leitura de estoque." },
          { status: 400 }
        );
      }

      const results: any[] = [];
      for (const target of targets) {
        results.push(await processVariationTarget(target));
      }

      return NextResponse.json({
        success: true,
        mode: "variation-stock-batch",
        results,
      });
    }

    if (mode === "apply-stock") {
      const updates = Array.isArray(body.updates) ? body.updates : [];
      if (!updates.length) {
        return NextResponse.json(
          { success: false, error: "Nenhum estoque confirmado para gravar." },
          { status: 400 }
        );
      }

      let verificados = 0;
      let estoqueAlterado = 0;
      let falhas = 0;
      const diagnosticos: any[] = [];

      for (const update of updates) {
        const siteId = str(update.siteId);
        const estoque = nonNegativeInt(update.estoque);
        if (!siteId || estoque == null) {
          falhas += 1;
          continue;
        }

        const existing = await prisma.produto.findUnique({
          where: { id: siteId },
          select: {
            id: true,
            nome: true,
            estoque: true,
          },
        });

        if (!existing) {
          falhas += 1;
          continue;
        }

        const data: AnyRecord = {
          estoque,
        };

        // Só alteramos os mapas de estoque. A lista de tamanhos e cores do
        // produto é mantida exatamente como o administrador cadastrou.
        if (update.matrizCompleta) {
          if (update.estoquePorTamanho && typeof update.estoquePorTamanho === "object") {
            data.estoquePorTamanho = update.estoquePorTamanho;
          }
          if (update.estoquePorCor && typeof update.estoquePorCor === "object") {
            data.estoquePorCor = update.estoquePorCor;
          }
        }

        await prisma.produto.update({
          where: { id: siteId },
          data,
        });

        verificados += 1;
        if (existing.estoque !== estoque) estoqueAlterado += 1;

        diagnosticos.push({
          siteId,
          tinyId: str(update.tinyId || siteId),
          nome: existing.nome,
          siteStockBefore: existing.estoque,
          tinyStock: estoque,
          estoqueMudou: existing.estoque !== estoque,
        });
      }

      return NextResponse.json({
        success: true,
        verificados,
        estoqueAlterado,
        falhas,
        diagnosticos,
      });
    }

    return NextResponse.json(
      { success: false, error: `Modo de sincronização inválido: ${mode || "vazio"}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("=== ERRO NA ATUALIZAÇÃO DE ESTOQUE OLIST/TINY V3 ===");
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

    return NextResponse.json(
      {
        success: false,
        error: errorMessage(error),
      },
      { status: 500 }
    );
  }
}
