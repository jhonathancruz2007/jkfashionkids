import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Função para normalizar strings com segurança.
// Evita erros caso algum valor vindo do banco/API seja undefined ou null.
function normalizar(texto: unknown = ""): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Formata o nome para salvar no banco com boa apresentação
function formatarNomeCategoria(slugOuNome: string): string {
  const mapaNomes: Record<string, string> = {
    CONJUNTOS: "Conjuntos",
    VESTIDOS: "Vestidos",
    BLUSAS: "Blusas e Camisetas",
    CAMISETAS: "Blusas e Camisetas",
    BLUSAS_CAMISETAS: "Blusas e Camisetas",
    CALCAS_SHORTS: "Calças e Shorts",
    CALCAS: "Calças e Shorts",
    SHORTS: "Calças e Shorts",
    CALCADOS: "Calçados",
    ACESSORIOS: "Acessórios",
  };

  const chave = String(slugOuNome ?? "")
    .toUpperCase()
    .trim();

  if (mapaNomes[chave]) {
    return mapaNomes[chave];
  }

  return String(slugOuNome ?? "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(
      (palavra) =>
        palavra.charAt(0).toUpperCase() +
        palavra.slice(1)
    )
    .join(" ");
}

// GET: Buscar um produto específico por ID
export async function GET(
  req: Request,
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
        {
          erro: "Não encontrado",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      ...produto,

      // Compatibilidade com o frontend
      imagem: produto.imagemUrl,
    });
  } catch (error: any) {
    console.error(
      "🔥 ERRO FATAL na API de produtos [id] (GET):",
      error
    );

    return NextResponse.json(
      {
        erro: error?.message || "Erro interno",
      },
      {
        status: 500,
      }
    );
  }
}

// PUT: Atualizar um produto existente
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const body = await req.json();

    const {
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

    // ==========================================
    // CATEGORIA
    // ==========================================

    let idCategoriaFinal: string | null = null;

    const termoCategoria = String(
      categoriaId || categoria || ""
    ).trim();

    if (termoCategoria) {
      const categoriasBanco =
        await prisma.categoria.findMany();

      const termoNorm = normalizar(termoCategoria);

      let categoriaEncontrada =
        categoriasBanco.find((cat) => {
          // IMPORTANTE:
          // cat.id pode estar ausente em algum registro inconsistente.
          // Nunca chamar .toLowerCase() diretamente em um valor possivelmente undefined.
          const catIdNorm = normalizar(cat?.id);

          const catNomeNorm = normalizar(cat?.nome);

          return (
            catIdNorm === termoNorm ||
            catNomeNorm === termoNorm
          );
        });

      // Se não existir, cria automaticamente
      if (!categoriaEncontrada) {
        const nomeFormatado =
          formatarNomeCategoria(
            termoCategoria
          );

        console.log(
          `✨ Categoria "${nomeFormatado}" não encontrada. Criando no banco...`
        );

        categoriaEncontrada =
          await prisma.categoria.create({
            data: {
              nome: nomeFormatado,
            },
          });
      }

      idCategoriaFinal =
        categoriaEncontrada.id;
    }

    // ==========================================
    // FOTO POR COR
    // ==========================================

    let coresDetalhesFinal:
      | Record<string, string>
      | undefined = undefined;

    if (
      coresDetalhes !== undefined &&
      coresDetalhes !== null &&
      typeof coresDetalhes === "object" &&
      !Array.isArray(coresDetalhes)
    ) {
      const coresPermitidas = Array.isArray(cores)
        ? cores
            .filter(
              (cor: unknown): cor is string =>
                typeof cor === "string"
            )
        : [];

      coresDetalhesFinal = {};

      for (const [cor, valor] of Object.entries(
        coresDetalhes
      )) {
        // Aceita:
        // "Azul": "https://..."
        //
        // e também:
        // "Azul": {
        //   imagemUrl: "https://..."
        // }

        let imagem = "";

        if (typeof valor === "string") {
          imagem = valor.trim();
        } else if (
          valor &&
          typeof valor === "object" &&
          "imagemUrl" in valor
        ) {
          imagem = String(
            (valor as { imagemUrl?: unknown }).imagemUrl ?? ""
          ).trim();
        }

        // Só salva foto se a cor ainda existir no produto.
        // Quando não houver cores definidas, preserva o comportamento
        // de aceitar as imagens recebidas.
        if (
          imagem &&
          (
            coresPermitidas.length === 0 ||
            coresPermitidas.includes(cor)
          )
        ) {
          coresDetalhesFinal[cor] = imagem;
        }
      }
    }

    // ==========================================
    // ATUALIZA PRODUTO
    // ==========================================

    const produtoAtualizado =
      await prisma.produto.update({
        where: { id },

        data: {
          ...(nome !== undefined && {
            nome: String(nome),
          }),

          ...(descricao !== undefined && {
            descricao: String(descricao),
          }),

          ...(preco !== undefined && {
            preco: Number(preco) || 0,
          }),

          ...(precoPromocional !== undefined && {
            precoPromocional:
              precoPromocional === null ||
              precoPromocional === ""
                ? null
                : Number(precoPromocional),
          }),

          ...(imagemUrl !== undefined && {
            imagemUrl: String(imagemUrl || ""),
          }),

          ...(imagens !== undefined && {
            imagens: Array.isArray(imagens)
              ? imagens.filter(
                  (item: unknown) =>
                    typeof item === "string"
                )
              : [],
          }),

          ...(estoque !== undefined && {
            estoque:
              Number.parseInt(
                String(estoque),
                10
              ) || 0,
          }),

          ...(tamanhos !== undefined && {
            tamanhos: Array.isArray(tamanhos)
              ? tamanhos.filter(
                  (item: unknown) =>
                    typeof item === "string"
                )
              : [],
          }),

          ...(estoquePorTamanho !== undefined && {
            estoquePorTamanho,
          }),

          ...(cores !== undefined && {
            cores: Array.isArray(cores)
              ? cores.filter(
                  (item: unknown) =>
                    typeof item === "string"
                )
              : [],
          }),

          ...(estoquePorCor !== undefined && {
            estoquePorCor,
          }),

          // ======================================
          // FOTO ESPECÍFICA DE CADA COR
          // ======================================
          ...(coresDetalhesFinal !== undefined && {
            coresDetalhes: coresDetalhesFinal,
          }),

          ...(genero !== undefined && {
            genero: genero
              ? String(genero)
              : null,
          }),

          // ======================================
          // FAIXA ETÁRIA
          // Aceita inclusive "todas"
          // ======================================
          ...(faixaEtaria !== undefined && {
            faixaEtaria:
              faixaEtaria === null ||
              faixaEtaria === ""
                ? null
                : String(faixaEtaria),
          }),

          ...(ativo !== undefined && {
            ativo: Boolean(ativo),
          }),

          ...(localCard !== undefined && {
            localCard: localCard
              ? String(localCard)
              : null,
          }),

          ...(idCategoriaFinal && {
            categoriaNome:
              (
                await prisma.categoria.findUnique(
                  {
                    where: {
                      id: idCategoriaFinal,
                    },
                  }
                )
              )?.nome,
          }),
        },

        include: {
          categoria: true,
        },
      });

    return NextResponse.json(
      {
        ...produtoAtualizado,
        imagem:
          produtoAtualizado.imagemUrl,
      },
      {
        status: 200,
      }
    );
  } catch (error: any) {
    console.error(
      "🔥 ERRO FATAL na API de produtos [id] (PUT):",
      error
    );

    return NextResponse.json(
      {
        erro: error?.message || "Erro interno",
      },
      {
        status: 500,
      }
    );
  }
}

// DELETE: Remover um produto
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.produto.delete({
      where: { id },
    });

    return NextResponse.json({
      mensagem:
        "Produto excluído com sucesso",
    });
  } catch (error: any) {
    console.error(
      "🔥 ERRO FATAL na API de produtos [id] (DELETE):",
      error
    );

    return NextResponse.json(
      {
        erro: error?.message || "Erro interno",
      },
      {
        status: 500,
      }
    );
  }
}
