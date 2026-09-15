import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";
const MAX_PAGES = 1000;
const DEFAULT_API_LIMIT_PER_MINUTE = 20;
const PLACEHOLDER_IMAGE = "https://via.placeholder.com/300";

type SyncType = "estoque" | "novos_produtos" | "geral";

type TinyGrade =
  | Record<string, string | number | null | undefined>
  | Array<Record<string, unknown>>
  | null
  | undefined;

type TinyVariation = {
  id?: string | number;
  codigo?: string;
  preco?: string | number;
  preco_promocional?: string | number;
  estoque_atual?: string | number;
  grade?: TinyGrade;
};

type TinyProduct = {
  id?: string | number;
  nome?: string;
  codigo?: string;
  preco?: string | number;
  preco_promocional?: string | number;
  descricao_complementar?: string;
  obs?: string;
  tipo?: string;
  tipoVariacao?: "N" | "P" | "V" | string;
  idProdutoPai?: string | number;
  situacao?: string;
  categoria?: string;
  estoque_atual?: string | number;
  grade?: TinyGrade;
  variacoes?:
    | Array<{ variacao?: TinyVariation } | TinyVariation>
    | { [key: string]: unknown };
  anexos?: Array<{ anexo?: string }>;
  imagens_externas?: Array<{ imagem_externa?: { url?: string } }>;
};

type TinyResponse = {
  retorno?: {
    status?: string;
    status_processamento?: number | string;
    codigo_erro?: number | string;
    erros?: Array<{ erro?: string }>;
    pagina?: number | string;
    numero_paginas?: number | string;
    produtos?: Array<{ produto?: TinyProduct }>;
    produto?: TinyProduct;
  };
};

type StockItem = {
  grupoId: string;
  produtoId: string;
  tamanho: string;
  cor: string;
  saldoConhecido?: number;
};

type GroupedProduct = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  precoPromocional: number | null;
  estoqueTotal: number;
  tamanhos: Set<string>;
  cores: Set<string>;
  estoquePorTamanho: Map<string, number>;
  estoquePorCor: Map<string, number>;
  imagens: string[];
};

type SearchGroup = {
  key: string;
  parentId: string;
  representative: TinyProduct;
  members: TinyProduct[];
};

function numberOrZero(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrEmpty(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    const text = stringOrEmpty(value);
    if (text) return text;
  }
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * O Tiny informa em x-limit-api quantas requisições/minuto a conta possui.
 * Mantemos uma única fila de chamadas para não estourar o limite.
 */
class TinyRateLimiter {
  private nextAllowedAt = 0;
  private limitPerMinute = DEFAULT_API_LIMIT_PER_MINUTE;

  updateFromHeader(header: string | null): void {
    const parsed = header ? Number.parseInt(header, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      this.limitPerMinute = parsed;
    }
  }

  getLimit(): number {
    return this.limitPerMinute;
  }

  async wait(): Promise<void> {
    // Usa um pequeno colchão para evitar ultrapassar o limite por arredondamento.
    const safeLimit = Math.max(1, this.limitPerMinute - 1);
    const interval = Math.ceil(60_000 / safeLimit);

    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAt - now);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    this.nextAllowedAt = Date.now() + interval;
  }
}

const rateLimiter = new TinyRateLimiter();

function tinyErrorMessage(data: TinyResponse, fallback = "O Tiny não retornou os dados solicitados."): string {
  const errors = data.retorno?.erros
    ?.map((item) => stringOrEmpty(item.erro))
    .filter(Boolean);

  return errors && errors.length > 0 ? errors.join(" | ") : fallback;
}

function looksLikeRateLimitError(message: string): boolean {
  const normalized = normalizeText(message);
  return (
    normalized.includes("limite") ||
    normalized.includes("rate limit") ||
    normalized.includes("muitas requisicoes") ||
    normalized.includes("excesso de requisicoes") ||
    normalized.includes("aguarde")
  );
}

async function tinyPost<T>(
  endpoint: string,
  params: Record<string, string | number>,
  retry = 0
): Promise<T> {
  const token = process.env.TINY_API_TOKEN?.trim();
  if (!token) throw new Error("Variável TINY_API_TOKEN não encontrada.");

  await rateLimiter.wait();

  const body = new URLSearchParams();
  body.set("token", token);
  body.set("formato", "json");

  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value));
  }

  const response = await fetch(`${TINY_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  rateLimiter.updateFromHeader(response.headers.get("x-limit-api"));

  const text = await response.text();
  let data: T | null = null;

  try {
    data = JSON.parse(text) as T;
  } catch {
    if (response.status === 429 && retry < 3) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") || "60", 10);
      await sleep(Math.max(5, Number.isFinite(retryAfter) ? retryAfter : 60) * 1000);
      return tinyPost<T>(endpoint, params, retry + 1);
    }

    throw new Error(
      `Tiny retornou uma resposta inválida no endpoint ${endpoint}. HTTP ${response.status}.`
    );
  }

  const tinyData = data as T & TinyResponse;
  const tinyMessage = tinyErrorMessage(tinyData);

  if (response.status === 429 || looksLikeRateLimitError(tinyMessage)) {
    if (retry < 3) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") || "60", 10);
      await sleep(Math.max(5, Number.isFinite(retryAfter) ? retryAfter : 60) * 1000);
      return tinyPost<T>(endpoint, params, retry + 1);
    }
  }

  if (!response.ok) {
    throw new Error(`Tiny respondeu HTTP ${response.status} no endpoint ${endpoint}: ${tinyMessage}`);
  }

  return data as T;
}

function extractImageUrls(product: TinyProduct): string[] {
  const urls: string[] = [];

  for (const item of product.anexos ?? []) {
    const url = stringOrEmpty(item?.anexo);
    if (url) urls.push(url);
  }

  for (const item of product.imagens_externas ?? []) {
    const url = stringOrEmpty(item?.imagem_externa?.url);
    if (url) urls.push(url);
  }

  return [...new Set(urls)];
}

function normalizeGrade(grade?: TinyGrade): { tamanho: string; cor: string } {
  let tamanho = "";
  let cor = "";

  const processarEntrada = (rawKey: unknown, rawValue: unknown) => {
    const key = normalizeText(stringOrEmpty(rawKey));
    const value = stringOrEmpty(rawValue);

    if (!key || !value) return;

    if (
      !tamanho &&
      (key.includes("tamanho") || key === "tam" || key.includes("size"))
    ) {
      tamanho = value;
      return;
    }

    if (
      !cor &&
      (key.includes("cor") || key.includes("color") || key.includes("colour"))
    ) {
      cor = value;
    }
  };

  if (Array.isArray(grade)) {
    for (const item of grade) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      for (const [key, value] of Object.entries(item)) {
        processarEntrada(key, value);
      }
    }
  } else if (grade && typeof grade === "object") {
    for (const [key, value] of Object.entries(grade)) {
      processarEntrada(key, value);
    }
  }

  return { tamanho, cor };
}

function getProductNameBase(product: TinyProduct): string {
  const nome = stringOrEmpty(product.nome);
  if (!nome) return "Produto sem nome";

  const parts = nome
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return parts.slice(0, -2).join(" - ").trim();
  }

  return nome;
}

function getGradeFromName(nome: string): { tamanho: string; cor: string } {
  const parts = nome
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return { tamanho: "", cor: "" };
  }

  return {
    tamanho: parts[parts.length - 2] || "",
    cor: parts[parts.length - 1] || "",
  };
}

function normalizeVariations(raw: TinyProduct["variacoes"]): TinyVariation[] {
  if (!raw) return [];

  const result: TinyVariation[] = [];

  const pushCandidate = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const objectValue = value as Record<string, unknown>;
    const candidate = objectValue.variacao && typeof objectValue.variacao === "object"
      ? objectValue.variacao
      : value;

    if (candidate && typeof candidate === "object" && stringOrEmpty((candidate as TinyVariation).id)) {
      result.push(candidate as TinyVariation);
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) pushCandidate(item);
  } else {
    for (const value of Object.values(raw)) pushCandidate(value);
  }

  const unique = new Map<string, TinyVariation>();
  for (const item of result) {
    const id = stringOrEmpty(item.id);
    if (id) unique.set(id, item);
  }

  return [...unique.values()];
}

async function pesquisarPagina(pagina: number): Promise<{
  produtos: TinyProduct[];
  numeroPaginas: number;
}> {
  const data = await tinyPost<TinyResponse>("produtos.pesquisa.php", {
    pesquisa: "",
    pagina,
  });

  const retorno = data.retorno;

  if (!retorno || retorno.status !== "OK") {
    throw new Error(tinyErrorMessage(data));
  }

  return {
    produtos: (retorno.produtos ?? [])
      .map((item) => item.produto)
      .filter((item): item is TinyProduct => Boolean(item?.id)),
    numeroPaginas: numberOrZero(retorno.numero_paginas),
  };
}

async function obterProduto(id: string): Promise<TinyProduct> {
  const data = await tinyPost<TinyResponse>("produto.obter.php", { id });
  const retorno = data.retorno;

  if (!retorno || retorno.status !== "OK" || !retorno.produto) {
    throw new Error(tinyErrorMessage(data));
  }

  return retorno.produto;
}

async function obterEstoque(id: string): Promise<number> {
  const data = await tinyPost<TinyResponse>("produto.obter.estoque.php", { id });
  const retorno = data.retorno;

  if (!retorno || retorno.status !== "OK" || !retorno.produto) {
    throw new Error(tinyErrorMessage(data));
  }

  const produto = retorno.produto as TinyProduct & {
    saldo?: string | number;
    depositos?: Array<{
      deposito?: {
        saldo?: string | number;
        desconsiderar?: string;
      };
    }>;
  };

  const saldoDireto = finiteNumber(produto.saldo);
  if (saldoDireto !== null) return saldoDireto;

  const depositos = Array.isArray(produto.depositos) ? produto.depositos : [];

  return depositos.reduce((total, item) => {
    const deposito = item?.deposito;
    if (!deposito) return total;
    if (normalizeText(stringOrEmpty(deposito.desconsiderar)) === "s") return total;
    return total + numberOrZero(deposito.saldo);
  }, 0);
}

function mapToObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "pt-BR", { numeric: true })
    )
  );
}

function setAddAmount(map: Map<string, number>, key: string, amount: number) {
  const normalized = stringOrEmpty(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function buildSearchGroups(produtosPesquisa: TinyProduct[]): SearchGroup[] {
  const parentsByName = new Map<string, string>();

  for (const product of produtosPesquisa) {
    if (product.tipoVariacao !== "P") continue;
    const id = stringOrEmpty(product.id);
    if (!id) continue;
    parentsByName.set(normalizeText(getProductNameBase(product)), id);
  }

  const groups = new Map<string, SearchGroup>();

  for (const product of produtosPesquisa) {
    const id = stringOrEmpty(product.id);
    if (!id) continue;

    let parentId = stringOrEmpty(product.idProdutoPai);

    if (!parentId && product.tipoVariacao === "P") {
      parentId = id;
    }

    if (!parentId && product.tipoVariacao === "V") {
      parentId = parentsByName.get(normalizeText(getProductNameBase(product))) || "";
    }

    if (!parentId) {
      parentId = id;
    }

    const key = parentId;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        parentId,
        representative: product,
        members: [],
      });
    }

    groups.get(key)!.members.push(product);
  }

  return [...groups.values()];
}

export async function POST(req: Request) {
  const token = process.env.TINY_API_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Variável TINY_API_TOKEN não encontrada." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tipo: SyncType =
      body?.tipo === "estoque" ||
      body?.tipo === "novos_produtos" ||
      body?.tipo === "geral"
        ? body.tipo
        : "geral";

    // 1. Pesquisa todo o catálogo. O Tiny retorna, por padrão, 100 registros por página.
    const produtosPesquisa: TinyProduct[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= totalPaginas && pagina <= MAX_PAGES) {
      const paginaAtual = await pesquisarPagina(pagina);
      produtosPesquisa.push(...paginaAtual.produtos);
      totalPaginas = paginaAtual.numeroPaginas || pagina;
      if (pagina >= totalPaginas) break;
      pagina += 1;
    }

    // 2. Agrupa pelos produtos pai quando o Tiny disponibiliza idProdutoPai.
    //    Se o campo não vier na pesquisa, usamos o produto pai encontrado pelo nome
    //    e, como último fallback, o próprio ID/nome-base.
    const searchGroups = buildSearchGroups(produtosPesquisa);

    const produtosAgrupados: Record<string, GroupedProduct> = {};
    const stockItems: StockItem[] = [];

    let produtosPaiObtidos = 0;
    let errosProdutosPai = 0;
    const amostrasErros: string[] = [];

    for (const group of searchGroups) {
      let produtoCompleto: TinyProduct | null = null;

      // Só consultamos produto.obter para produtos que podem possuir variações.
      // Isso elimina centenas de chamadas desnecessárias que estavam causando
      // o limite da API.
      const podeTerVariacoes =
        group.representative.tipoVariacao === "P" ||
        group.members.some((item) => item.tipoVariacao === "V") ||
        group.members.length > 1;

      if (podeTerVariacoes) {
        try {
          produtoCompleto = await obterProduto(group.parentId);
          produtosPaiObtidos += 1;
        } catch (error) {
          errosProdutosPai += 1;
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          if (amostrasErros.length < 10) {
            amostrasErros.push(`Produto ${group.parentId}: ${message}`);
          }
        }
      }

      const base = produtoCompleto ?? group.representative;
      const nome = firstNonEmpty(base.nome, group.representative.nome, `Produto ${group.parentId}`);
      const nomeBase = getProductNameBase(base);
      const imagens = extractImageUrls(base);
      const preco = numberOrZero(base.preco ?? group.representative.preco);
      const precoPromocionalValue = base.preco_promocional ?? group.representative.preco_promocional;
      const precoPromocional =
        precoPromocionalValue === undefined || precoPromocionalValue === ""
          ? null
          : numberOrZero(precoPromocionalValue);

      const groupId = group.parentId;

      produtosAgrupados[groupId] = {
        id: groupId,
        nome: nomeBase || nome,
        descricao: firstNonEmpty(base.descricao_complementar, base.obs, nomeBase || nome),
        preco,
        precoPromocional,
        estoqueTotal: 0,
        tamanhos: new Set<string>(),
        cores: new Set<string>(),
        estoquePorTamanho: new Map<string, number>(),
        estoquePorCor: new Map<string, number>(),
        imagens: imagens.length > 0 ? imagens : [PLACEHOLDER_IMAGE],
      };

      const stockIds = new Map<string, { tamanho: string; cor: string; saldoConhecido?: number }>();

      const variacoesCompletas = produtoCompleto
        ? normalizeVariations(produtoCompleto.variacoes)
        : [];

      if (variacoesCompletas.length > 0) {
        for (const variation of variacoesCompletas) {
          const variationId = stringOrEmpty(variation.id);
          if (!variationId) continue;

          let grade = normalizeGrade(variation.grade);
          if (!grade.tamanho && !grade.cor) {
            const member = group.members.find(
              (item) => stringOrEmpty(item.id) === variationId
            );
            if (member?.nome) {
              grade = getGradeFromName(member.nome);
            }
          }

          stockIds.set(variationId, {
            tamanho: grade.tamanho,
            cor: grade.cor,
            saldoConhecido: finiteNumber(variation.estoque_atual) ?? undefined,
          });
        }
      } else {
        // Fallback para contas em que o produto pai não pôde ser obtido.
        // Continua possível sincronizar usando os registros da pesquisa.
        for (const member of group.members) {
          if (member.tipoVariacao === "P") continue;

          const variationId = stringOrEmpty(member.id);
          if (!variationId) continue;

          const grade = normalizeGrade(member.grade);
          const gradeFinal =
            grade.tamanho || grade.cor
              ? grade
              : getGradeFromName(stringOrEmpty(member.nome));

          stockIds.set(variationId, {
            tamanho: gradeFinal.tamanho,
            cor: gradeFinal.cor,
            saldoConhecido: finiteNumber(member.estoque_atual) ?? undefined,
          });
        }
      }

      // Produto normal sem variações.
      if (stockIds.size === 0) {
        const simpleId = stringOrEmpty(base.id) || groupId;
        const grade = normalizeGrade(base.grade);
        stockIds.set(simpleId, {
          tamanho: grade.tamanho,
          cor: grade.cor,
          saldoConhecido: finiteNumber(base.estoque_atual) ?? undefined,
        });
      }

      for (const [produtoId, info] of stockIds.entries()) {
        // Se a API já trouxe estoque_atual, não gastamos mais uma chamada.
        stockItems.push({
          grupoId: groupId,
          produtoId,
          tamanho: info.tamanho,
          cor: info.cor,
          ...(info.saldoConhecido !== undefined
            ? { saldoConhecido: info.saldoConhecido }
            : {}),
        });
      }
    }

    // 3. Consulta estoque somente onde não temos estoque_atual.
    //    As chamadas são sequenciais e limitadas pelo x-limit-api para não
    //    reproduzir o erro anterior de centenas de requisições simultâneas.
    let estoquesConsultados = 0;
    let estoquesComErro = 0;
    const gruposComErroEstoque = new Set<string>();

    for (const item of stockItems) {
      let saldo = item.saldoConhecido;

      if (saldo === undefined) {
        try {
          saldo = await obterEstoque(item.produtoId);
          estoquesConsultados += 1;
        } catch (error) {
          estoquesComErro += 1;
          gruposComErroEstoque.add(item.grupoId);
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          if (amostrasErros.length < 10) {
            amostrasErros.push(`Estoque ${item.produtoId}: ${message}`);
          }
          continue;
        }
      }

      const grupo = produtosAgrupados[item.grupoId];
      if (!grupo) continue;

      grupo.estoqueTotal += saldo;
      if (item.tamanho) {
        grupo.tamanhos.add(item.tamanho);
        setAddAmount(grupo.estoquePorTamanho, item.tamanho, saldo);
      }
      if (item.cor) {
        grupo.cores.add(item.cor);
        setAddAmount(grupo.estoquePorCor, item.cor, saldo);
      }
    }

    // 4. Persiste sem inventar distribuição de estoque.
    let criados = 0;
    let atualizados = 0;
    let ignoradosPorErro = 0;

    for (const prod of Object.values(produtosAgrupados)) {
      if (gruposComErroEstoque.has(prod.id)) {
        ignoradosPorErro += 1;
        continue;
      }

      const tamanhos = [...prod.tamanhos].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true })
      );
      const cores = [...prod.cores].sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      );
      const estoquePorTamanho = mapToObject(prod.estoquePorTamanho);
      const estoquePorCor = mapToObject(prod.estoquePorCor);
      const imagens = [...new Set(prod.imagens.filter(Boolean))];

      const existentePorId = await prisma.produto.findUnique({
        where: { id: prod.id },
      });

      const existente =
        existentePorId ??
        (await prisma.produto.findFirst({ where: { nome: prod.nome } }));

      if (tipo === "novos_produtos") {
        if (existente) continue;

        await prisma.produto.create({
          data: {
            id: prod.id,
            nome: prod.nome,
            descricao: prod.descricao,
            preco: prod.preco,
            precoPromocional: prod.precoPromocional,
            estoque: prod.estoqueTotal,
            tamanhos,
            cores,
            estoquePorTamanho,
            estoquePorCor,
            imagemUrl: imagens[0] ?? PLACEHOLDER_IMAGE,
            imagens,
            ativo: true,
          },
        });
        criados += 1;
        continue;
      }

      if (tipo === "estoque") {
        if (!existente) continue;

        await prisma.produto.update({
          where: { id: existente.id },
          data: {
            estoque: prod.estoqueTotal,
            tamanhos,
            cores,
            estoquePorTamanho,
            estoquePorCor,
          },
        });
        atualizados += 1;
        continue;
      }

      if (existente) {
        await prisma.produto.update({
          where: { id: existente.id },
          data: {
            nome: prod.nome,
            descricao: prod.descricao,
            preco: prod.preco,
            precoPromocional: prod.precoPromocional,
            estoque: prod.estoqueTotal,
            tamanhos,
            cores,
            estoquePorTamanho,
            estoquePorCor,
            imagemUrl:
              imagens[0] && imagens[0] !== PLACEHOLDER_IMAGE
                ? imagens[0]
                : undefined,
            imagens:
              imagens.length > 0 && imagens[0] !== PLACEHOLDER_IMAGE
                ? imagens
                : undefined,
          },
        });
        atualizados += 1;
      } else {
        await prisma.produto.create({
          data: {
            id: prod.id,
            nome: prod.nome,
            descricao: prod.descricao,
            preco: prod.preco,
            precoPromocional: prod.precoPromocional,
            estoque: prod.estoqueTotal,
            tamanhos,
            cores,
            estoquePorTamanho,
            estoquePorCor,
            imagemUrl: imagens[0] ?? PLACEHOLDER_IMAGE,
            imagens,
            ativo: true,
          },
        });
        criados += 1;
      }
    }

    const parcialmenteConcluida =
      errosProdutosPai > 0 || estoquesComErro > 0 || ignoradosPorErro > 0;

    const message = parcialmenteConcluida
      ? `Sincronização parcial: ${criados} novos e ${atualizados} atualizados. ${ignoradosPorErro} produtos foram preservados sem alteração por falha de consulta.`
      : `Sincronização concluída! ${criados} novos e ${atualizados} produtos atualizados.`;

    return NextResponse.json({
      success: true,
      message,
      details: parcialmenteConcluida
        ? [
            errosProdutosPai > 0
              ? `${errosProdutosPai} produtos-pai não puderam ser obtidos.`
              : "",
            estoquesComErro > 0
              ? `${estoquesComErro} estoques individuais não puderam ser consultados.`
              : "",
            amostrasErros.length > 0
              ? `Amostras: ${amostrasErros.join(" || ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        : undefined,
      estatisticas: {
        limiteApiPorMinuto: rateLimiter.getLimit(),
        paginas: totalPaginas,
        produtosPesquisa: produtosPesquisa.length,
        grupos: searchGroups.length,
        produtosPaiObtidos,
        errosProdutosPai,
        variacoesOuProdutosParaEstoque: stockItems.length,
        estoquesConsultados,
        estoquesComErro,
        ignoradosPorErro,
        criados,
        atualizados,
      },
    });
  } catch (error) {
    console.error("Erro na sincronização Tiny:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao processar sincronização com o Tiny.",
        details:
          error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}
