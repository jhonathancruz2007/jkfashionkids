import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Busca um produto específico
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const produto = await prisma.produto.findUnique({
      where: { id },
      include: {
        categoria: true,
      },
    });

    if (!produto) {
      return NextResponse.json(
        { error: "Produto não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(produto);
  } catch (error) {
    console.error("Erro ao buscar produto:", error);

    return NextResponse.json(
      { error: "Erro ao buscar produto" },
      { status: 500 }
    );
  }
}

// PUT - Atualiza um produto específico
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      nome,
      descricao,
      preco,
      precoPromocional,
      imagemUrl,
      estoque,
      tamanhos,
      estoquePorTamanho,
      cores,
      estoquePorCor,
      coresDetalhes,
      faixaEtaria,
      genero,
      ativo,
      localCard,
      categoriaId,
      categoria,
    } = body;

    // Mantém a lógica atual de categoria: aceita categoriaId
    // diretamente ou tenta localizar/criar a categoria pelo nome enviado.
    let idCategoriaFinal = categoriaId;

    if (!idCategoriaFinal && categoria) {
      if (typeof categoria === "string") {
        const categoriaTrimmed = categoria.trim();

        if (categoriaTrimmed) {
          const categoriaExistente = await prisma.categoria.findFirst({
            where: {
              nome: {
                equals: categoriaTrimmed,
                mode: "insensitive",
              },
            },
          });

          if (categoriaExistente) {
            idCategoriaFinal = categoriaExistente.id;
          } else {
            const novaCategoria = await prisma.categoria.create({
              data: {
                nome: categoriaTrimmed,
              },
            });

            idCategoriaFinal = novaCategoria.id;
          }
        }
      } else if (typeof categoria === "object" && categoria !== null) {
        if (typeof categoria.id === "string" && categoria.id.trim()) {
          idCategoriaFinal = categoria.id;
        } else if (
          typeof categoria.nome === "string" &&
          categoria.nome.trim()
        ) {
          const categoriaTrimmed = categoria.nome.trim();

          const categoriaExistente = await prisma.categoria.findFirst({
            where: {
              nome: {
                equals: categoriaTrimmed,
                mode: "insensitive",
              },
            },
          });

          if (categoriaExistente) {
            idCategoriaFinal = categoriaExistente.id;
          } else {
            const novaCategoria = await prisma.categoria.create({
              data: {
                nome: categoriaTrimmed,
              },
            });

            idCategoriaFinal = novaCategoria.id;
          }
        }
      }
    }

    // Só envia para o Prisma os campos que realmente foram informados.
    // Isso evita sobrescrever dados existentes por undefined.
    const data: Record<string, unknown> = {
      ...(nome !== undefined && { nome }),
      ...(descricao !== undefined && { descricao }),
      ...(preco !== undefined && {
        preco: typeof preco === "number" ? preco : parseFloat(preco),
      }),
      ...(precoPromocional !== undefined && {
        precoPromocional:
          precoPromocional === null || precoPromocional === ""
            ? null
            : typeof precoPromocional === "number"
              ? precoPromocional
              : parseFloat(precoPromocional),
      }),
      ...(imagemUrl !== undefined && { imagemUrl }),
      ...(estoque !== undefined && {
        estoque: typeof estoque === "number" ? estoque : parseInt(estoque, 10),
      }),
      ...(tamanhos !== undefined && {
        tamanhos: Array.isArray(tamanhos) ? tamanhos : [],
      }),
      ...(estoquePorTamanho !== undefined && { estoquePorTamanho }),
      ...(cores !== undefined && {
        cores: Array.isArray(cores) ? cores : [],
      }),
      ...(estoquePorCor !== undefined && { estoquePorCor }),
      ...(coresDetalhes !== undefined && { coresDetalhes }),
      ...(faixaEtaria !== undefined && {
        faixaEtaria:
          faixaEtaria === null || faixaEtaria === ""
            ? null
            : String(faixaEtaria),
      }),
      ...(genero !== undefined && { genero }),
      ...(ativo !== undefined && { ativo: Boolean(ativo) }),
      ...(localCard !== undefined && { localCard }),
      ...(idCategoriaFinal && { categoriaId: idCategoriaFinal }),
    };

    const produto = await prisma.produto.update({
      where: { id },
      data,
      include: {
        categoria: true,
      },
    });

    return NextResponse.json(produto);
  } catch (error) {
    console.error("Erro ao atualizar produto:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar produto",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// DELETE - Exclui um produto específico
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.produto.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Produto excluído com sucesso",
    });
  } catch (error) {
    console.error("Erro ao excluir produto:", error);

    return NextResponse.json(
      {
        error: "Erro ao excluir produto",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
