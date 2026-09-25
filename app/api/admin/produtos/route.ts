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

    return NextResponse.json(produtos, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
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

    // =========================================================
    // CATEGORIA
    // =========================================================
    // No schema atual, Categoria usa "nome" como identificador.
    // Não acessamos cat.id.toLowerCase(), pois esse campo pode
    // não existir e era a origem do erro 500 no cadastro.
    // =========================================================

    let categoriaNome: string | undefined = undefined;

    const categoriaInformada = String(
      categoriaId ?? categoria ?? ""
    ).trim();

    if (categoriaInformada) {
      const categorias = await prisma.categoria.findMany();

      const normalizar = (texto: unknown): string =>
        String(texto ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

      const categoriaNorm = normalizar(categoriaInformada);

      const categoriaEncontrada = categorias.find((cat) => {
        return normalizar(cat?.nome) === categoriaNorm;
      });

      if (categoriaEncontrada?.nome) {
        categoriaNome = categoriaEncontrada.nome;
      }
    }

    // =========================================================
    // NORMALIZAÇÃO DOS DADOS DO PRODUTO
    // =========================================================

    const precoNumerico = Number(preco);

    if (!Number.isFinite(precoNumerico)) {
      return NextResponse.json(
        {
          error: "O preço informado é inválido.",
        },
        { status: 400 }
      );
    }

    let precoPromocionalFinal: number | null = null;

    if (
      precoPromocional !== null &&
      precoPromocional !== undefined &&
      precoPromocional !== ""
    ) {
      const promocionalNumerico = Number(precoPromocional);

      if (!Number.isFinite(promocionalNumerico)) {
        return NextResponse.json(
          {
            error: "O preço promocional informado é inválido.",
          },
          { status: 400 }
        );
      }

      precoPromocionalFinal = promocionalNumerico;
    }

    const estoqueFinal =
      estoque !== undefined && estoque !== null
        ? Number.parseInt(String(estoque), 10) || 0
        : 0;

    const tamanhosFinal = Array.isArray(tamanhos)
      ? tamanhos.filter(
          (item: unknown): item is string =>
            typeof item === "string"
        )
      : [];

    const coresFinal = Array.isArray(cores)
      ? cores.filter(
          (item: unknown): item is string =>
            typeof item === "string"
        )
      : [];

    const imagensFinal = Array.isArray(imagens)
      ? imagens.filter(
          (item: unknown): item is string =>
            typeof item === "string"
        )
      : [];

    const coresDetalhesFinal =
      coresDetalhes &&
      typeof coresDetalhes === "object" &&
      !Array.isArray(coresDetalhes)
        ? coresDetalhes
        : {};

    // =========================================================
    // CRIAÇÃO
    // =========================================================

    const produto = await prisma.produto.create({
      data: {
        ...(id ? { id: String(id) } : {}),

        nome: String(nome),
        descricao: String(descricao),

        preco: precoNumerico,

        precoPromocional: precoPromocionalFinal,

        imagemUrl: String(imagemUrl || ""),

        imagens: imagensFinal,

        estoque: estoqueFinal,

        tamanhos: tamanhosFinal,

        estoquePorTamanho:
          estoquePorTamanho !== undefined
            ? estoquePorTamanho
            : null,

        cores: coresFinal,

        estoquePorCor:
          estoquePorCor !== undefined
            ? estoquePorCor
            : null,

        // FOTO ESPECÍFICA DE CADA COR
        coresDetalhes: coresDetalhesFinal,

        genero: genero
          ? String(genero)
          : "masculino",

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
