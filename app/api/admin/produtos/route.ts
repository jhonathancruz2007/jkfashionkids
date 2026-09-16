import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: Buscar todos os produtos
export async function GET() {
  try {
    const produtos = await prisma.produto.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(produtos, { status: 200 });
  } catch (erro) {
    console.error("Erro ao carregar produtos do banco:", erro);

    return NextResponse.json(
      { error: "Erro ao buscar produtos" },
      { status: 500 }
    );
  }
}

// POST: Criar novo produto
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
      ativo,
      localCard,
      categoriaId,
      categoria,
    } = body;

    if (!nome || !descricao || preco === undefined) {
      return NextResponse.json(
        {
          error: "Nome, descrição e preço são obrigatórios.",
        },
        { status: 400 }
      );
    }

    let categoriaNome: string | undefined = undefined;

    const categoriaInformada = String(
      categoriaId || categoria || ""
    ).trim();

    if (categoriaInformada) {
      const categorias = await prisma.categoria.findMany();

      const normalizar = (texto: string) =>
        texto
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

      const categoriaEncontrada = categorias.find((cat) => {
        return (
          cat.id.toLowerCase() === categoriaInformada.toLowerCase() ||
          normalizar(cat.nome) === normalizar(categoriaInformada)
        );
      });

      if (categoriaEncontrada) {
        categoriaNome = categoriaEncontrada.nome;
      }
    }

    const produto = await prisma.produto.create({
      data: {
        ...(id ? { id: String(id) } : {}),

        nome: String(nome),
        descricao: String(descricao),

        preco: Number(preco) || 0,

        precoPromocional:
          precoPromocional === null ||
          precoPromocional === undefined ||
          precoPromocional === ""
            ? null
            : Number(precoPromocional),

        imagemUrl: String(imagemUrl || ""),

        imagens: Array.isArray(imagens)
          ? imagens.filter((item: unknown) => typeof item === "string")
          : [],

        estoque:
          estoque !== undefined && estoque !== null
            ? Number.parseInt(String(estoque), 10) || 0
            : 0,

        tamanhos: Array.isArray(tamanhos) ? tamanhos : [],

        estoquePorTamanho:
          estoquePorTamanho !== undefined
            ? estoquePorTamanho
            : null,

        cores: Array.isArray(cores) ? cores : [],

        estoquePorCor:
          estoquePorCor !== undefined
            ? estoquePorCor
            : null,

        // FOTO ESPECÍFICA DE CADA COR
        coresDetalhes:
          coresDetalhes &&
          typeof coresDetalhes === "object" &&
          !Array.isArray(coresDetalhes)
            ? coresDetalhes
            : {},

        genero: genero ? String(genero) : "masculino",

        faixaEtaria: faixaEtaria
          ? String(faixaEtaria)
          : "INFANTIL",

        ativo:
          ativo !== undefined
            ? Boolean(ativo)
            : true,

        localCard: localCard
          ? String(localCard)
          : "HOME_DESTAQUE",

        ...(categoriaNome
          ? { categoriaNome }
          : {}),
      },
    });

    return NextResponse.json(produto, {
      status: 201,
    });
  } catch (error: any) {
    console.error(
      "🔥 ERRO FATAL na API de produtos (POST):",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro interno ao criar produto.",
      },
      {
        status: 500,
      }
    );
  }
}
