import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// LEITURA SEGURA DOS PRODUTOS
//
// O banco Neon e o histórico local do Prisma estão divergentes.
// Para a LISTAGEM, usamos SQL direto e somente colunas que existem
// no banco atual. Assim não dependemos de campos que podem existir
// apenas no schema local (como `variacoes`).
// ============================================================
type ProdutoLista = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  precoPromocional: number | null;
  imagemUrl: string;
  imagens: string[];
  estoque: number;
  tamanhos: string[];
  estoquePorTamanho: unknown;
  cores: string[];
  estoquePorCor: unknown;
  coresDetalhes: unknown;
  genero: string | null;
  faixaEtaria: string | null;
  estacao: string | null;
  ativo: boolean;
  localCard: string | null;
  categoriaNome: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function buscarProdutosDiretoDoBanco(): Promise<ProdutoLista[]> {
  return prisma.$queryRaw<ProdutoLista[]>`
    SELECT
      "id",
      "nome",
      "descricao",
      "preco",
      "precoPromocional",
      "imagemUrl",
      "imagens",
      "estoque",
      "tamanhos",
      "estoquePorTamanho",
      "cores",
      "estoquePorCor",
      "coresDetalhes",
      "genero",
      "faixaEtaria",
      "estacao",
      "ativo",
      "localCard",
      "categoriaNome",
      "createdAt",
      "updatedAt"
    FROM "Produto"
    ORDER BY "createdAt" DESC
  `;
}

function serializarProduto(produto: ProdutoLista) {
  return {
    ...produto,
    imagem: produto.imagemUrl,
    categoria: produto.categoriaNome
      ? { nome: produto.categoriaNome }
      : null,
  };
}

// GET: buscar todos os produtos do banco, incluindo inativos para o admin
export async function GET() {
  try {
    const produtos = await buscarProdutosDiretoDoBanco();

    return NextResponse.json(produtos.map(serializarProduto), {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    console.error("🔥 ERRO AO LISTAR PRODUTOS NO ADMIN:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar produtos",
        detalhe: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

// POST permanece compatível com o cadastro atual.
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      id,
      nome,
      descricao,
      preco,
      precoPromocional,
      imagemUrl,
      imagens,
      estoque,
      tamanhos,
      estoquePorTamanho,
      cores,
      estoquePorCor,
      coresDetalhes,
      genero,
      faixaEtaria,
      estacao,
      ativo,
      localCard,
      categoriaId,
      categoria,
    } = body;

    if (!nome || !descricao || preco === undefined) {
      return NextResponse.json(
        { error: "Nome, descrição e preço são obrigatórios." },
        { status: 400 }
      );
    }

    const normalizar = (texto: unknown): string =>
      String(texto ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    let categoriaNome: string | undefined;
    const categoriaInformada = String(categoriaId ?? categoria ?? "").trim();

    if (categoriaInformada) {
      const categorias = await prisma.categoria.findMany({
        select: { nome: true },
      });
      const alvo = normalizar(categoriaInformada);
      const encontrada = categorias.find((cat) => normalizar(cat.nome) === alvo);
      if (encontrada?.nome) categoriaNome = encontrada.nome;
    }

    const precoNumerico = Number(preco);
    if (!Number.isFinite(precoNumerico)) {
      return NextResponse.json(
        { error: "O preço informado é inválido." },
        { status: 400 }
      );
    }

    let precoPromocionalFinal: number | null = null;
    if (precoPromocional !== null && precoPromocional !== undefined && precoPromocional !== "") {
      const valor = Number(precoPromocional);
      if (!Number.isFinite(valor)) {
        return NextResponse.json(
          { error: "O preço promocional informado é inválido." },
          { status: 400 }
        );
      }
      precoPromocionalFinal = valor;
    }

    const produto = await prisma.produto.create({
      data: {
        ...(id ? { id: String(id) } : {}),
        nome: String(nome),
        descricao: String(descricao),
        preco: precoNumerico,
        precoPromocional: precoPromocionalFinal,
        imagemUrl: String(imagemUrl || ""),
        imagens: Array.isArray(imagens)
          ? imagens.filter((item: unknown): item is string => typeof item === "string")
          : [],
        estoque: estoque !== undefined && estoque !== null
          ? Number.parseInt(String(estoque), 10) || 0
          : 0,
        tamanhos: Array.isArray(tamanhos)
          ? tamanhos.filter((item: unknown): item is string => typeof item === "string")
          : [],
        estoquePorTamanho: estoquePorTamanho !== undefined ? estoquePorTamanho : null,
        cores: Array.isArray(cores)
          ? cores.filter((item: unknown): item is string => typeof item === "string")
          : [],
        estoquePorCor: estoquePorCor !== undefined ? estoquePorCor : null,
        coresDetalhes:
          coresDetalhes && typeof coresDetalhes === "object" && !Array.isArray(coresDetalhes)
            ? coresDetalhes
            : {},
        genero: genero ? String(genero) : "masculino",
        faixaEtaria: faixaEtaria ? String(faixaEtaria) : "INFANTIL",
        estacao: estacao === "inverno" || estacao === "verao" ? estacao : null,
        ativo: ativo !== undefined ? Boolean(ativo) : true,
        localCard: localCard ? String(localCard) : "HOME_DESTAQUE",
        ...(categoriaNome ? { categoriaNome } : {}),
      },
      // Evita que o retorno do Prisma tente selecionar campos divergentes.
      select: {
        id: true,
        nome: true,
        descricao: true,
        preco: true,
        precoPromocional: true,
        imagemUrl: true,
        imagens: true,
        estoque: true,
        tamanhos: true,
        estoquePorTamanho: true,
        cores: true,
        estoquePorCor: true,
        coresDetalhes: true,
        genero: true,
        faixaEtaria: true,
        estacao: true,
        ativo: true,
        localCard: true,
        categoriaNome: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      { ...produto, imagem: produto.imagemUrl },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("🔥 ERRO FATAL NO CADASTRO DE PRODUTO:", error);
    return NextResponse.json(
      { error: error?.message || "Erro interno ao criar produto." },
      { status: 500 }
    );
  }
}
