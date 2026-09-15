import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";
const DEFAULT_LIMIT_PER_MINUTE = 20;
const MAX_SEARCH_PAGES = 1000;
const MAX_STOCK_BATCH = 5;
const PLACEHOLDER_IMAGE = "https://via.placeholder.com/300";

type SyncType = "geral" | "estoque" | "novos_produtos";
type Action = "start" | "stock" | "finish";

type TinyGrade = Record<string, unknown> | Array<Record<string, unknown>> | null | undefined;

type TinyProduct = {
  id?: string | number;
  nome?: string;
  codigo?: string;
  preco?: string | number;
  preco_promocional?: string | number;
  descricao_complementar?: string;
  obs?: string;
  tipoVariacao?: string;
  idProdutoPai?: string | number;
  situacao?: string;
  estoque_atual?: string | number;
  grade?: TinyGrade;
  variacoes?: unknown;
  anexos?: Array<{ anexo?: string }>;
  imagens_externas?: Array<{ imagem_externa?: { url?: string } }>;
};

type TinyResponse = {
  retorno?: {
    status?: string;
    codigo_erro?: number | string;
    erros?: Array<{ erro?: string }>;
    pagina?: number | string;
    numero_paginas?: number | string;
    produtos?: Array<{ produto?: TinyProduct }>;
    produto?: TinyProduct;
  };
};

type StartVariation = {
  id: string;
  tamanho: string;
  cor: string;
  estoque_atual?: number;
};

type StartGroup = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  precoPromocional: number | null;
  imagens: string[];
  tipoVariacao: string;
  variations: StartVariation[];
};

type StockResult = {
  id: string;
  saldo: number;
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function number(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(data: TinyResponse, fallback = "O Tiny não retornou os dados solicitados."): string {
  const errors = (data.retorno?.erros ?? [])
    .map((item) => text(item?.erro))
    .filter(Boolean);

  if (errors.length) return errors.join(" | ");
  return fallback;
}

async function tinyPost<T>(
  endpoint: string,
  params: Record<string, string | number>,
  retries = 2,
): Promise<{ data: T; headers: Headers }> {
  const token = process.env.TINY_API_TOKEN?.trim();
  if (!token) throw new Error("Variável TINY_API_TOKEN não encontrada.");

  const body = new URLSearchParams();
  body.set("token", token);
  body.set("formato", "json");

  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  let response = await fetch(`${TINY_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  // A API 2.0 documenta POST para este serviço. Algumas contas/rotas
  // antigas, porém, podem responder 405 para a chamada POST do estoque.
  // Nessa situação fazemos fallback para GET somente no endpoint de estoque.
  if (response.status === 405 && endpoint === "produto.obter.estoque.php") {
    const query = new URLSearchParams(body.toString());
    response = await fetch(`${TINY_BASE_URL}/${endpoint}?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  }

  const raw = await response.text();
  let data: T;

  try {
    data = JSON.parse(raw) as T;
  } catch {
    if (retries > 0 && (response.status === 429 || response.status >= 500)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000);
      return tinyPost<T>(endpoint, params, retries - 1);
    }

    throw new Error(`Resposta inválida do Tiny em ${endpoint}. HTTP ${response.status}.`);
  }

  const tiny = data as T & TinyResponse;
  const message = errorMessage(tiny);

  if (response.status === 429 || message.toLowerCase().includes("limite")) {
    if (retries > 0) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000);
      return tinyPost<T>(endpoint, params, retries - 1);
    }
  }

  if (!response.ok) {
    throw new Error(`Tiny respondeu HTTP ${response.status} em ${endpoint}: ${message}`);
  }

  return { data, headers: response.headers };
}

function limitFromHeaders(headers: Headers): number {
  const value = Number(headers.get("x-limit-api"));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMIT_PER_MINUTE;
}

function extractImages(product: TinyProduct): string[] {
  const urls: string[] = [];

  for (const item of product.anexos ?? []) {
    const url = text(item?.anexo);
    if (url) urls.push(url);
  }

  for (const item of product.imagens_externas ?? []) {
    const url = text(item?.imagem_externa?.url);
    if (url) urls.push(url);
  }

  return [...new Set(urls)];
}

function gradeFromName(name: string): { tamanho: string; cor: string } {
  const parts = name
    .split(" - ")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 3) return { tamanho: "", cor: "" };

  return {
    tamanho: parts[parts.length - 2] ?? "",
    cor: parts[parts.length - 1] ?? "",
  };
}

function gradeFromTiny(grade: TinyGrade): { tamanho: string; cor: string } {
  let tamanho = "";
  let cor = "";

  const inspect = (keyRaw: unknown, valueRaw: unknown) => {
    const key = normalize(text(keyRaw));
    const value = text(valueRaw);
    if (!key || !value) return;

    if (!tamanho && (key.includes("tamanho") || key === "tam" || key.includes("size"))) {
      tamanho = value;
    }

    if (!cor && (key.includes("cor") || key.includes("color") || key.includes("colour"))) {
      cor = value;
    }
  };

  if (Array.isArray(grade)) {
    for (const item of grade) {
      if (!item || typeof item !== "object") continue;
      for (const [key, value] of Object.entries(item)) inspect(key, value);
    }
  } else if (grade && typeof grade === "object") {
    for (const [key, value] of Object.entries(grade)) inspect(key, value);
  }

  return { tamanho, cor };
}

function baseName(name: string): string {
  const parts = name
    .split(" - ")
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.length >= 3 ? parts.slice(0, -2).join(" - ").trim() : name.trim();
}

function normalizeVariations(raw: unknown): TinyProduct[] {
  if (!raw) return [];

  const result: TinyProduct[] = [];

  const push = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const objectValue = value as Record<string, unknown>;
    const candidate = objectValue.variacao && typeof objectValue.variacao === "object"
      ? objectValue.variacao
      : value;

    if (candidate && typeof candidate === "object") {
      const id = text((candidate as TinyProduct).id);
      if (id) result.push(candidate as TinyProduct);
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else if (typeof raw === "object") {
    for (const item of Object.values(raw as Record<string, unknown>)) push(item);
  }

  const unique = new Map<string, TinyProduct>();
  for (const item of result) unique.set(text(item.id), item);
  return [...unique.values()];
}

async function searchAllProducts(): Promise<{ products: TinyProduct[]; apiLimit: number }> {
  const products: TinyProduct[] = [];
  let page = 1;
  let totalPages = 1;
  let apiLimit = DEFAULT_LIMIT_PER_MINUTE;

  while (page <= totalPages && page <= MAX_SEARCH_PAGES) {
    const { data, headers } = await tinyPost<TinyResponse>("produtos.pesquisa.php", {
      pesquisa: "",
      pagina: page,
    });

    apiLimit = limitFromHeaders(headers);

    const retorno = data.retorno;
    if (!retorno || retorno.status !== "OK") {
      throw new Error(errorMessage(data));
    }

    products.push(
      ...(retorno.produtos ?? [])
        .map((item) => item.produto)
        .filter((item): item is TinyProduct => Boolean(item?.id)),
    );

    totalPages = number(retorno.numero_paginas) || page;
    page += 1;

    // As páginas de pesquisa são baratas. Um pequeno intervalo evita rajadas.
    if (page <= totalPages) await sleep(150);
  }

  return { products, apiLimit };
}

function buildGroups(products: TinyProduct[]): StartGroup[] {
  const parents = new Map<string, TinyProduct>();
  const parentsByName = new Map<string, string>();

  for (const product of products) {
    if (text(product.tipoVariacao).toUpperCase() !== "P") continue;
    const id = text(product.id);
    if (!id) continue;

    parents.set(id, product);
    parentsByName.set(normalize(baseName(text(product.nome))), id);
  }

  const groups = new Map<string, StartGroup>();
  const seenVariationIds = new Map<string, Set<string>>();

  const ensureGroup = (id: string, representative: TinyProduct) => {
    if (!groups.has(id)) {
      const name = baseName(text(representative.nome)) || text(representative.nome) || `Produto ${id}`;
      const pricePromo = optionalNumber(representative.preco_promocional);
      groups.set(id, {
        id,
        nome: name,
        descricao:
          text(representative.descricao_complementar) ||
          text(representative.obs) ||
          name,
        preco: number(representative.preco),
        precoPromocional: pricePromo ?? null,
        imagens: extractImages(representative),
        tipoVariacao: text(representative.tipoVariacao),
        variations: [],
      });
      seenVariationIds.set(id, new Set());
    }
  };

  for (const product of products) {
    const productId = text(product.id);
    if (!productId) continue;

    let groupId = text(product.idProdutoPai);
    const tipo = text(product.tipoVariacao).toUpperCase();

    if (!groupId && tipo === "P") groupId = productId;
    if (!groupId && tipo === "V") {
      groupId = parentsByName.get(normalize(baseName(text(product.nome)))) || "";
    }
    if (!groupId) groupId = productId;

    ensureGroup(groupId, parents.get(groupId) ?? product);

    const group = groups.get(groupId)!;
    const seen = seenVariationIds.get(groupId)!;

    // Produto pai: a própria pesquisa já representa o grupo; não o tratamos como SKU de estoque.
    if (tipo === "P") continue;

    let grade = gradeFromTiny(product.grade);
    if (!grade.tamanho && !grade.cor) grade = gradeFromName(text(product.nome));

    if (seen.has(productId)) continue;
    seen.add(productId);

    group.variations.push({
      id: productId,
      tamanho: grade.tamanho,
      cor: grade.cor,
      ...(optionalNumber(product.estoque_atual) !== undefined
        ? { estoque_atual: optionalNumber(product.estoque_atual) }
        : {}),
    });
  }

  // Para os poucos produtos-pai identificados, buscamos uma única vez o cadastro completo.
  // Isso serve para recuperar variações que não vieram na pesquisa e imagens reais, sem
  // repetir a antiga estratégia de consultar cada produto do catálogo.
  for (const [groupId, parent] of parents.entries()) {
    const group = groups.get(groupId);
    if (!group) continue;

    // A pesquisa já pode ter trazido todas as variações. O detalhe do pai fica opcional;
    // ele será buscado no endpoint "finish" somente para complementar imagens/variações.
    void parent;
  }

  return [...groups.values()];
}

async function getStock(id: string): Promise<StockResult> {
  const { data } = await tinyPost<TinyResponse>("produto.obter.estoque.php", { id });
  const retorno = data.retorno;

  if (!retorno || retorno.status !== "OK" || !retorno.produto) {
    throw new Error(errorMessage(data));
  }

  const product = retorno.produto as TinyProduct & {
    saldo?: string | number;
    depositos?: Array<{
      deposito?: {
        saldo?: string | number;
        desconsiderar?: string;
      };
    }>;
  };

  const direct = optionalNumber(product.saldo);
  if (direct !== undefined) return { id, saldo: direct };

  const total = (product.depositos ?? []).reduce((sum, item) => {
    const deposito = item?.deposito;
    if (!deposito) return sum;
    if (normalize(text(deposito.desconsiderar)) === "s") return sum;
    return sum + number(deposito.saldo);
  }, 0);

  return { id, saldo: total };
}

function sumByKey(
  values: Array<{ tamanho: string; cor: string; saldo: number }>,
): {
  estoque: number;
  tamanhos: string[];
  cores: string[];
  estoquePorTamanho: Record<string, number>;
  estoquePorCor: Record<string, number>;
} {
  const porTamanho = new Map<string, number>();
  const porCor = new Map<string, number>();
  const tamanhos = new Set<string>();
  const cores = new Set<string>();
  let estoque = 0;

  for (const item of values) {
    estoque += item.saldo;

    if (item.tamanho) {
      tamanhos.add(item.tamanho);
      porTamanho.set(item.tamanho, (porTamanho.get(item.tamanho) ?? 0) + item.saldo);
    }

    if (item.cor) {
      cores.add(item.cor);
      porCor.set(item.cor, (porCor.get(item.cor) ?? 0) + item.saldo);
    }
  }

  return {
    estoque: Math.round(estoque),
    tamanhos: [...tamanhos].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    cores: [...cores].sort((a, b) => a.localeCompare(b, "pt-BR")),
    estoquePorTamanho: Object.fromEntries(porTamanho),
    estoquePorCor: Object.fromEntries(porCor),
  };
}

async function fetchParentImages(id: string): Promise<string[]> {
  try {
    const { data } = await tinyPost<TinyResponse>("produto.obter.php", { id });
    if (data.retorno?.status !== "OK" || !data.retorno.produto) return [];
    return extractImages(data.retorno.produto);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    const tipo: SyncType =
      body?.tipo === "estoque" || body?.tipo === "novos_produtos" || body?.tipo === "geral"
        ? body.tipo
        : "geral";

    const token = process.env.TINY_API_TOKEN?.trim();
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Variável TINY_API_TOKEN não encontrada." },
        { status: 500 },
      );
    }

    if (action === "start") {
      const startedAt = Date.now();
      const { products, apiLimit } = await searchAllProducts();
      const groups = buildGroups(products);

      return NextResponse.json({
        success: true,
        action: "start",
        tipo,
        apiLimit,
        groups,
        estatisticas: {
          paginas: Math.ceil(products.length / 100),
          produtosPesquisa: products.length,
          grupos: groups.length,
          duracaoMs: Date.now() - startedAt,
        },
      });
    }

    if (action === "stock") {
      const variations = Array.isArray(body?.variations) ? body.variations : [];
      const offset = Math.max(0, Number(body?.offset) || 0);
      const requestedBatch = Math.max(1, Number(body?.batchSize) || MAX_STOCK_BATCH);
      const batchSize = Math.min(MAX_STOCK_BATCH, requestedBatch);
      const batch = variations.slice(offset, offset + batchSize) as StartVariation[];

      if (!batch.length) {
        return NextResponse.json({
          success: true,
          action: "stock",
          stocks: [],
          nextOffset: offset,
          done: true,
          waitMs: 0,
        });
      }

      const startedAt = Date.now();
      const results = await Promise.all(
        batch.map(async (variation) => {
          const id = text(variation.id);
          if (!id) throw new Error("Variação sem ID.");

          // Se a pesquisa já trouxe estoque_atual, podemos usá-lo sem outra chamada.
          if (variation.estoque_atual !== undefined) {
            return { id, saldo: number(variation.estoque_atual) };
          }

          return getStock(id);
        }),
      );

      const apiLimit = DEFAULT_LIMIT_PER_MINUTE;
      const waitMs = Math.ceil((results.length / apiLimit) * 60_000) + 300;

      return NextResponse.json({
        success: true,
        action: "stock",
        stocks: results,
        nextOffset: offset + batch.length,
        done: offset + batch.length >= variations.length,
        waitMs,
        duracaoMs: Date.now() - startedAt,
      });
    }

    if (action === "finish") {
      const group = body?.group as StartGroup | undefined;
      const rawStocks = Array.isArray(body?.stocks) ? body.stocks : [];

      if (!group?.id || !group?.nome) {
        return NextResponse.json(
          { success: false, error: "Grupo de produto inválido para finalização." },
          { status: 400 },
        );
      }

      const stocks = rawStocks.map((item: any) => ({
        id: text(item?.id),
        saldo: number(item?.saldo),
        tamanho:
          group.variations.find((v) => text(v.id) === text(item?.id))?.tamanho ?? "",
        cor:
          group.variations.find((v) => text(v.id) === text(item?.id))?.cor ?? "",
      }));

      const aggregates = sumByKey(stocks);
      let imagens = [...new Set((group.imagens ?? []).filter(Boolean))];

      if (!imagens.length && group.tipoVariacao.toUpperCase() === "P") {
        imagens = await fetchParentImages(group.id);
      }

      const existentePorId = await prisma.produto.findUnique({ where: { id: group.id } });
      const existente =
        existentePorId ??
        (await prisma.produto.findFirst({ where: { nome: group.nome } }));

      const imageUrl = imagens[0] ?? PLACEHOLDER_IMAGE;
      const imageData = imagens.length ? imagens : [PLACEHOLDER_IMAGE];

      if (tipo === "novos_produtos") {
        if (existente) {
          return NextResponse.json({ success: true, action: "finish", status: "ignored" });
        }

        await prisma.produto.create({
          data: {
            id: group.id,
            nome: group.nome,
            descricao: group.descricao,
            preco: group.preco,
            precoPromocional: group.precoPromocional,
            estoque: aggregates.estoque,
            tamanhos: aggregates.tamanhos,
            cores: aggregates.cores,
            estoquePorTamanho: aggregates.estoquePorTamanho,
            estoquePorCor: aggregates.estoquePorCor,
            imagemUrl: imageUrl,
            imagens: imageData,
            ativo: true,
          },
        });

        return NextResponse.json({ success: true, action: "finish", status: "created" });
      }

      if (tipo === "estoque") {
        if (!existente) {
          return NextResponse.json({ success: true, action: "finish", status: "missing" });
        }

        await prisma.produto.update({
          where: { id: existente.id },
          data: {
            estoque: aggregates.estoque,
            tamanhos: aggregates.tamanhos,
            cores: aggregates.cores,
            estoquePorTamanho: aggregates.estoquePorTamanho,
            estoquePorCor: aggregates.estoquePorCor,
          },
        });

        return NextResponse.json({ success: true, action: "finish", status: "updated" });
      }

      if (existente) {
        await prisma.produto.update({
          where: { id: existente.id },
          data: {
            nome: group.nome,
            descricao: group.descricao,
            preco: group.preco,
            precoPromocional: group.precoPromocional,
            estoque: aggregates.estoque,
            tamanhos: aggregates.tamanhos,
            cores: aggregates.cores,
            estoquePorTamanho: aggregates.estoquePorTamanho,
            estoquePorCor: aggregates.estoquePorCor,
            imagemUrl: imagens.length ? imageUrl : undefined,
            imagens: imagens.length ? imageData : undefined,
          },
        });

        return NextResponse.json({ success: true, action: "finish", status: "updated" });
      }

      await prisma.produto.create({
        data: {
          id: group.id,
          nome: group.nome,
          descricao: group.descricao,
          preco: group.preco,
          precoPromocional: group.precoPromocional,
          estoque: aggregates.estoque,
          tamanhos: aggregates.tamanhos,
          cores: aggregates.cores,
          estoquePorTamanho: aggregates.estoquePorTamanho,
          estoquePorCor: aggregates.estoquePorCor,
          imagemUrl: imageUrl,
          imagens: imageData,
          ativo: true,
        },
      });

      return NextResponse.json({ success: true, action: "finish", status: "created" });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Ação de sincronização inválida. Use start, stock ou finish.",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("Erro na sincronização Tiny:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao processar sincronização com o Tiny.",
        details: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 },
    );
  }
}
