import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Função para normalizar strings (remove acentos, espaços e caixa alta)
function normalizar(texto: string = ""): string {
  return texto
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

  const chave = slugOuNome.toUpperCase().trim();
  if (mapaNomes[chave]) return mapaNomes[chave];

  return slugOuNome
    .toLowerCase()
    .split(" ")
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
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
      include: { categoria: true },
    });

    if (!produto) {
      return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ...produto, imagem: produto.imagemUrl });
  } catch (error: any) {
    console.error("🔥 ERRO FATAL na API de produtos [id] (GET):", error);
    return NextResponse.json({ erro: error.message || "Erro interno" }, { status: 500 });
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
      estoque,
      tamanhos,
      estoquePorTamanho,
      genero,
      ativo,
      localCard,
      categoriaId,
      categoria,
    } = body;

    let idCategoriaFinal: string | null = null;
    const termoCategoria = String(categoriaId || categoria || "").trim();

    if (termoCategoria) {
      const categoriasBanco = await prisma.categoria.findMany();
      const termoNorm = normalizar(termoCategoria);

      // 1. Procura se a categoria já existe (por ID ou por Nome)
      let categoriaEncontrada = categoriasBanco.find((cat) => {
        const catIdNorm = cat.id.toLowerCase();
        const catNomeNorm = normalizar(cat.nome);
        return catIdNorm === termoNorm || catNomeNorm === termoNorm;
      });

      // 2. Se a categoria não existir no banco, CRIA ELA AUTOMATICAMENTE
      if (!categoriaEncontrada) {
        const nomeFormatado = formatarNomeCategoria(termoCategoria);
        console.log(`✨ Categoria "${nomeFormatado}" não encontrada. Criando no banco...`);

        categoriaEncontrada = await prisma.categoria.create({
          data: {
            nome: nomeFormatado,
          },
        });
      }

      idCategoriaFinal = categoriaEncontrada.id;
    }

    // 3. Atualiza o produto com o ID real da categoria
    const produtoAtualizado = await prisma.produto.update({
      where: { id },
      data: {
        ...(nome && { nome }),
        ...(descricao !== undefined && { descricao }),
        ...(preco !== undefined && { preco: parseFloat(preco) }),
        ...(precoPromocional !== undefined && {
          precoPromocional: precoPromocional ? parseFloat(precoPromocional) : null,
        }),
        ...(imagemUrl && { imagemUrl }),
        ...(estoque !== undefined && { estoque: parseInt(estoque) }),
        ...(tamanhos && { tamanhos: Array.isArray(tamanhos) ? tamanhos : [] }),
        ...(estoquePorTamanho !== undefined && { estoquePorTamanho }),
        ...(genero && { genero }),
        ...(ativo !== undefined && { ativo: Boolean(ativo) }),
        ...(localCard && { localCard }),
        ...(idCategoriaFinal && { categoriaId: idCategoriaFinal }),
      },
      include: { categoria: true },
    });

    return NextResponse.json(produtoAtualizado);
  } catch (error: any) {
    console.error("🔥 ERRO FATAL na API de produtos [id] (PUT):", error);
    return NextResponse.json({ erro: error.message || "Erro interno" }, { status: 500 });
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

    return NextResponse.json({ mensagem: "Produto excluído com sucesso" });
  } catch (error: any) {
    console.error("🔥 ERRO FATAL na API de produtos [id] (DELETE):", error);
    return NextResponse.json({ erro: error.message || "Erro interno" }, { status: 500 });
  }
}