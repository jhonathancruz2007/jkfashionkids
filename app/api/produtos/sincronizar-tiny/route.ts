import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";
const MAX_PAGES = 1000;
const STOCK_CONCURRENCY = 5;
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
  grade?: TinyGrade;
  variacoes?: Array<{ variacao?: TinyVariation }>;
  anexos?: Array<{ anexo?: string }>;
  imagens_externas?: Array<{ imagem_externa?: { url?: string } }>;
};

type TinyResponse = {
  retorno?: {
    status?: string;
    status_processamento?: number;
    codigo_erro?: number;
    erros?: Array<{ erro?: string }>;
    pagina?: number;
    numero_paginas?: number;
    produtos?: Array<{ produto?: TinyProduct }>;
    produto?: TinyProduct;
  };
};

type StockResult = {
  id: string;
  saldo: number;
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

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
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
      (
        key.includes("tamanho") ||
        key === "tam" ||
        key.includes("size")
      )
    ) {
      tamanho = value;
      return;
    }

    if (
      !cor &&
      (
        key.includes("cor") ||
        key.includes("color") ||
        key.includes("colour")
      )
    ) {
      cor = value;
    }
  };

  if (grade && Array.isArray(grade)) {
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

function getParentId(product: TinyProduct): string {
  const id = stringOrEmpty(product.id);
  const parentId = stringOrEmpty(product.idProdutoPai);

  if (product.tipoVariacao === "V" && parentId) return parentId;
  return id;
}

function getProductNameBase(product: TinyProduct): string {
  const nome = stringOrEmpty(product.nome);
  if (!nome) return "Produto sem nome";

  // Esta função é somente fallback para contas em que as variações foram
  // cadastradas como nomes individuais. A fonte principal é a relação
  // tipoVariacao/idProdutoPai + produto.obter.php.
  const parts = nome.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3 && parts[parts.length - 1] && parts[parts.length - 2]) {
    return parts.slice(0, -2).join(" - ").trim();
  }
  return nome;
}

async function tinyPost<T>(
  endpoint: string,
  params: Record<string, string | number>
): Promise<T> {
  const token = process.env.TINY_API_TOKEN?.trim();
  if (!token) throw new Error("Variável TINY_API_TOKEN não encontrada.");

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

  const text = await response.text();
  let data: T;

  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Tiny retornou uma resposta inválida no endpoint ${endpoint}. HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(`Tiny respondeu HTTP ${response.status} no endpoint ${endpoint}.`);
  }

  return data;
}

function tinyErrorMessage(data: TinyResponse): string {
  return (
    data.retorno?.erros
      ?.map((item) => stringOrEmpty(item.erro))
      .filter(Boolean)
      .join(" | ") || "O Tiny não retornou os dados solicitados."
  );
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

async function obterEstoque(id: string): Promise<StockResult> {
  const data = await tinyPost<TinyResponse>("produto.obter.estoque.php", { id });
  const retorno = data.retorno;

  if (!retorno || retorno.status !== "OK" || !retorno.produto) {
    throw new Error(tinyErrorMessage(data));
  }

  const produtoEstoque = retorno.produto as TinyProduct & {
    saldo?: string | number;
    saldoReservado?: string | number;
    depositos?: Array<{
      deposito?: {
        saldo?: string | number;
        desconsiderar?: string;
      };
    }>;
  };

  // A API pode devolver o saldo consolidado diretamente no produto.
  const saldoDireto = Number(produtoEstoque.saldo);

  if (Number.isFinite(saldoDireto)) {
    return {
      id,
      saldo: saldoDireto,
    };
  }

  // Fallback: soma somente depósitos que não estejam marcados como
  // "desconsiderar" pelo Tiny.
  const depositos = Array.isArray(produtoEstoque.depositos)
    ? produtoEstoque.depositos
    : [];

  const saldoDosDepositos = depositos.reduce((total, item) => {
    const deposito = item?.deposito;

    if (!deposito) return total;
    if (stringOrEmpty(deposito.desconsiderar).toUpperCase() === "S") {
      return total;
    }

    return total + numberOrZero(deposito.saldo);
  }, 0);

  return {
    id,
    saldo: saldoDosDepositos,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

function mapToObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
  );
}

function setAddAmount(map: Map<string, number>, key: string, amount: number) {
  const normalized = stringOrEmpty(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

export async function POST(req: Request) {
  const token = process.env.TINY_API_TOKEN?.trim();

  if (!token) {
    return NextResponse.json(
      { error: "Variável TINY_API_TOKEN não encontrada." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tipo: SyncType =
      body?.tipo === "estoque" || body?.tipo === "novos_produtos" || body?.tipo === "geral"
        ? body.tipo
        : "geral";

    // 1. Busca TODAS as páginas retornadas pelo Tiny.
    const produtosPesquisa: TinyProduct[] = [];
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= Math.max(totalPaginas, 1) && pagina <= MAX_PAGES) {
      const paginaAtual = await pesquisarPagina(pagina);
      produtosPesquisa.push(...paginaAtual.produtos);
      const recebeuPaginaCompleta = paginaAtual.produtos.length >= 100;
      totalPaginas = paginaAtual.numeroPaginas || (recebeuPaginaCompleta ? pagina + 1 : pagina);

      if (pagina >= totalPaginas) break;
      pagina += 1;
    }

    // 2. Descobre os produtos-pai/individuais únicos.
    // Variações são ligadas ao produto pai por idProdutoPai.
    const idsRaiz = [
      ...new Set(
        produtosPesquisa
          .map(getParentId)
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ];

    const grupos = new Map<string, TinyProduct>();

    // 3. Obtém o cadastro completo de cada raiz.
    const resultadosProdutosCompletos = await mapWithConcurrency(
      idsRaiz,
      STOCK_CONCURRENCY,
      async (id) => {
        try {
          return { id, produto: await obterProduto(id), erro: "" };
        } catch (error) {
          return {
            id,
            produto: null,
            erro: error instanceof Error ? error.message : "Erro desconhecido",
          };
        }
      }
    );

    const errosProdutos = resultadosProdutosCompletos.filter((item) => item.erro);

    for (const resultado of resultadosProdutosCompletos) {
      if (!resultado.produto) continue;

      const id = getParentId(resultado.produto);
      if (id) grupos.set(id, resultado.produto);
    }

    if (grupos.size === 0 && resultadosProdutosCompletos.length > 0) {
      throw new Error(
        `Não foi possível obter nenhum produto completo do Tiny. ${
          errosProdutos[0]?.erro || "Verifique o token e as permissões da API."
        }`
      );
    }

    // 4. Monta a estrutura final de estoque por tamanho/cor.
    const produtosAgrupados: Record<string, GroupedProduct> = {};
    const idsParaEstoque: Array<{ grupoId: string; variacaoId: string; tamanho: string; cor: string }> = [];

    for (const [grupoId, product] of grupos.entries()) {
      const nome = firstNonEmpty(product.nome, getProductNameBase(product));
      const imagemUrls = extractImageUrls(product);
      const preco = numberOrZero(product.preco);
      const precoPromocional =
        product.preco_promocional !== undefined && product.preco_promocional !== ""
          ? numberOrZero(product.preco_promocional)
          : null;

      produtosAgrupados[grupoId] = {
        id: grupoId,
        nome: product.tipoVariacao === "P" ? nome : getProductNameBase(product),
        descricao: firstNonEmpty(product.descricao_complementar, product.obs, nome),
        preco,
        precoPromocional,
        estoqueTotal: 0,
        tamanhos: new Set<string>(),
        cores: new Set<string>(),
        estoquePorTamanho: new Map<string, number>(),
        estoquePorCor: new Map<string, number>(),
        imagens: imagemUrls.length > 0 ? imagemUrls : [PLACEHOLDER_IMAGE],
      };

      const variacoes = product.variacoes
        ?.map((entry) => entry.variacao)
        .filter((variation): variation is TinyVariation => Boolean(variation?.id)) ?? [];

      if (variacoes.length > 0) {
        for (const variation of variacoes) {
          const grade = normalizeGrade(variation.grade);
          idsParaEstoque.push({
            grupoId,
            variacaoId: stringOrEmpty(variation.id),
            tamanho: grade.tamanho,
            cor: grade.cor,
          });
        }
      } else {
        // Produto normal, sem variações.
        idsParaEstoque.push({
          grupoId,
          variacaoId: stringOrEmpty(product.id),
          tamanho: normalizeGrade(product.grade).tamanho,
          cor: normalizeGrade(product.grade).cor,
        });
      }
    }

    // 5. Consulta o saldo real de cada SKU/variação no Tiny.
    const estoques = await mapWithConcurrency(
      idsParaEstoque,
      STOCK_CONCURRENCY,
      async (item) => {
        try {
          const stock = await obterEstoque(item.variacaoId);
          return { ...item, saldo: stock.saldo, erro: "" };
        } catch (error) {
          return {
            ...item,
            saldo: 0,
            erro: error instanceof Error ? error.message : "Erro desconhecido ao consultar estoque",
          };
        }
      }
    );

    const errosEstoque = estoques.filter((item) => item.erro);
    const gruposComErroEstoque = new Set(
      errosEstoque.map((item) => item.grupoId)
    );

    for (const item of estoques) {
      const grupo = produtosAgrupados[item.grupoId];
      if (!grupo) continue;

      grupo.estoqueTotal += item.saldo;
      setAddAmount(grupo.estoquePorTamanho, item.tamanho, item.saldo);
      setAddAmount(grupo.estoquePorCor, item.cor, item.saldo);

      if (item.tamanho) grupo.tamanhos.add(item.tamanho);
      if (item.cor) grupo.cores.add(item.cor);
    }

    // 6. Persiste sem distribuir estoque artificialmente.
    let alterados = 0;
    let criados = 0;
    let atualizados = 0;

    for (const prod of Object.values(produtosAgrupados)) {
      // Nunca sobrescreva o estoque de um produto com dados parciais.
      // Se qualquer SKU/variação falhar, o grupo inteiro é preservado no banco.
      if (gruposComErroEstoque.has(prod.id)) {
        console.warn(
          `Produto ${prod.id} não sincronizado porque uma ou mais variações falharam no estoque.`
        );
        continue;
      }

      const tamanhos = [...prod.tamanhos].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true })
      );
      const cores = [...prod.cores].sort((a, b) => a.localeCompare(b, "pt-BR"));
      const estoquePorTamanho = mapToObject(prod.estoquePorTamanho);
      const estoquePorCor = mapToObject(prod.estoquePorCor);
      const imagens = [...new Set(prod.imagens.filter(Boolean))];

      if (tipo === "estoque") {
        const existente =
          (await prisma.produto.findUnique({ where: { id: prod.id } })) ??
          (await prisma.produto.findFirst({ where: { nome: prod.nome } }));

        if (existente) {
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
          alterados += 1;
        }

        continue;
      }

      if (tipo === "novos_produtos") {
        const existente =
          (await prisma.produto.findUnique({ where: { id: prod.id } })) ??
          (await prisma.produto.findFirst({ where: { nome: prod.nome } }));

        if (existente) continue;

        await prisma.produto.create({
          data: {
            id: prod.id,
            nome: prod.nome,
            descricao: prod.descricao,
            preco: prod.preco,
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

      const existente =
        (await prisma.produto.findUnique({ where: { id: prod.id } })) ??
        (await prisma.produto.findFirst({ where: { nome: prod.nome } }));

      if (existente) {
        await prisma.produto.update({
          where: { id: existente.id },
          data: {
            nome: prod.nome,
            preco: prod.preco,
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

      alterados += 1;
    }

    const mensagens: Record<SyncType, string> = {
      estoque: `Estoque de ${alterados} produtos atualizado com sucesso!`,
      novos_produtos: `${criados} novos produtos importados do Tiny!`,
      geral: `Sincronização concluída! ${criados} novos e ${atualizados} produtos atualizados.`,
    };

    return NextResponse.json({
      success: true,
      message: mensagens[tipo],
      details:
        [
          errosProdutos.length > 0
            ? `${errosProdutos.length} produtos-base não puderam ser obtidos do Tiny.`
            : "",
          errosEstoque.length > 0
            ? `${errosEstoque.length} variações não puderam ter o estoque consultado.`
            : "",
        ].filter(Boolean).join(" ") || undefined,
      estatisticas: {
        paginas: totalPaginas,
        produtosPesquisa: produtosPesquisa.length,
        produtosAgrupados: Object.keys(produtosAgrupados).length,
        produtosComErroAoObter: errosProdutos.length,
        variacoesConsultadas: idsParaEstoque.length,
        estoquesComErro: errosEstoque.length,
        criados,
        atualizados,
        alterados,
      },
    });
  } catch (error) {
    console.error("Erro na sincronização Tiny:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro interno ao processar sincronização com o Tiny.",
        details: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}
