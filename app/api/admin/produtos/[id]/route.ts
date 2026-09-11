import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Ordem customizada de tamanhos
const ORDEM_TAMANHOS = [
  'RN', 'P', 'M', 'G', 'GG', 
  '1', '2', '3', '4', '6', '8', '10', '12', '14', '16',
  'ÚNICO', 'UNICO'
]

// Função para tratar e ordenar os tamanhos
function processarTamanhos(tamanhosInput: any): string[] {
  if (!Array.isArray(tamanhosInput)) return ['Único']

  const filtrados = tamanhosInput
    .map((t: any) => String(t).trim())
    .filter((t: string) => t !== '')

  if (filtrados.length === 0) return ['Único']

  return [...filtrados].sort((a, b) => {
    const idxA = ORDEM_TAMANHOS.indexOf(a.toUpperCase())
    const idxB = ORDEM_TAMANHOS.indexOf(b.toUpperCase())

    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

// GET: Buscar um único produto pelo ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const produto = await prisma.produto.findUnique({
      where: { id: resolvedParams.id },
      include: { categoria: true },
    })

    if (!produto) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 })
    }

    return NextResponse.json(produto)
  } catch (error) {
    console.error("Erro ao buscar produto:", error)
    return NextResponse.json(
      { error: "Erro interno ao buscar produto." },
      { status: 500 }
    )
  }
}

// PUT: Atualizar produto existente
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams
    const body = await request.json()

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
      genero,
      faixaEtaria,
      ativo,
      localCard,
      categoriaId,
      categoriaNome,
    } = body

    // Validações dos campos obrigatórios
    if (!nome || typeof nome !== "string" || !nome.trim()) {
      return NextResponse.json({ error: "O campo Nome é obrigatório." }, { status: 400 })
    }

    if (!descricao || typeof descricao !== "string" || !descricao.trim()) {
      return NextResponse.json({ error: "O campo Descrição é obrigatório." }, { status: 400 })
    }

    if (preco === undefined || preco === null || preco === "" || isNaN(Number(String(preco).replace(',', '.')))) {
      return NextResponse.json({ error: "O campo Preço é obrigatório e deve ser um número válido." }, { status: 400 })
    }

    if (!imagemUrl || typeof imagemUrl !== "string" || !imagemUrl.trim()) {
      return NextResponse.json({ error: "A imagem principal do produto é obrigatória." }, { status: 400 })
    }

    // Tratamento dos tamanhos e estoque
    const tamanhosOrdenados = processarTamanhos(tamanhos)
    let estoqueTotalNum = parseInt(estoque) || 0
    let estoquePorTamanhoFinal = estoquePorTamanho

    if (estoquePorTamanhoFinal && typeof estoquePorTamanhoFinal === "object" && !Array.isArray(estoquePorTamanhoFinal)) {
      const estoqueFiltrado: Record<string, number> = {}
      for (const tam of tamanhosOrdenados) {
        if (tam in estoquePorTamanhoFinal) {
          estoqueFiltrado[tam] = Number(estoquePorTamanhoFinal[tam]) || 0
        } else {
          estoqueFiltrado[tam] = 0
        }
      }
      estoquePorTamanhoFinal = estoqueFiltrado

      const somaVariacoes = Object.values(estoquePorTamanhoFinal).reduce(
        (acc, curr) => acc + (Number(curr) || 0), 0
      )
      estoqueTotalNum = somaVariacoes
    } else if (
      tamanhosOrdenados.length === 1 && 
      tamanhosOrdenados[0] === 'Único' && 
      (!estoquePorTamanhoFinal || Object.keys(estoquePorTamanhoFinal).length === 0)
    ) {
      estoquePorTamanhoFinal = { 'Único': estoqueTotalNum }
    }

    // Formatação segura de valores numéricos
    const precoNum = parseFloat(String(preco).replace(',', '.'))
    const precoPromoNum = precoPromocional ? parseFloat(String(precoPromocional).replace(',', '.')) : null

    // Resolução da Categoria (Modelo usa 'nome' como chave primária)
    let categoriaNomeReal: string | null = null
    const valorCategoria = categoriaNome || categoriaId

    if (valorCategoria) {
      let nomeBusca = ""
      if (typeof valorCategoria === "object") {
        nomeBusca = String(valorCategoria.nome || valorCategoria.id || "").trim()
      } else {
        nomeBusca = String(valorCategoria).trim()
      }

      const valoresNulos = ["null", "undefined", "none", "0", "sem-categoria", "selecione", ""]
      if (nomeBusca && !valoresNulos.includes(nomeBusca.toLowerCase())) {
        let categoriaEncontrada = await prisma.categoria.findFirst({
          where: { nome: { equals: nomeBusca, mode: "insensitive" } }
        })

        if (!categoriaEncontrada) {
          const nomeFormatado = nomeBusca
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/(^\w|\s\w)/g, (l) => l.toUpperCase())

          try {
            categoriaEncontrada = await prisma.categoria.create({
              data: { nome: nomeFormatado }
            })
          } catch {
            categoriaEncontrada = await prisma.categoria.findFirst({
              where: { nome: { equals: nomeFormatado, mode: "insensitive" } }
            })
          }
        }

        if (categoriaEncontrada) {
          categoriaNomeReal = categoriaEncontrada.nome
        }
      }
    }

    // Montagem dos dados para atualização
    const updateData: any = {
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: precoNum,
      precoPromocional: precoPromoNum,
      imagemUrl: imagemUrl.trim(),
      imagens: Array.isArray(imagens) ? imagens : [],
      estoque: estoqueTotalNum,
      tamanhos: tamanhosOrdenados,
      estoquePorTamanho: estoquePorTamanhoFinal ?? null,
      genero: genero || "masculino",
      faixaEtaria: faixaEtaria || "INFANTIL",
      ativo: ativo !== undefined ? Boolean(ativo) : true,
      localCard: localCard || "HOME_DESTAQUE",
      categoriaNome: categoriaNomeReal,
    }

    const produtoAtualizado = await prisma.produto.update({
      where: { id },
      data: updateData,
      include: {
        categoria: true,
      },
    })

    return NextResponse.json(produtoAtualizado)
  } catch (error: any) {
    console.error("Erro detalhado ao atualizar produto:", error)
    return NextResponse.json(
      { error: `Erro no Banco de Dados: ${error.message || error}` },
      { status: 500 }
    )
  }
}

// DELETE: Deletar produto pelo ID (Trata relações e histórico de vendas)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams

    const produtoExistente = await prisma.produto.findUnique({
      where: { id },
      include: {
        _count: {
          select: { itensPedido: true }
        }
      }
    })

    if (!produtoExistente) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 })
    }

    // 1. Limpa relações descartáveis em transação
    await prisma.$transaction([
      prisma.itemCarrinho.deleteMany({ where: { produtoId: id } }),
      prisma.favorito.deleteMany({ where: { produtoId: id } }),
      prisma.avisoEstoque.deleteMany({ where: { produtoId: id } }),
    ])

    // 2. Se o produto possui histórico de vendas (ItemPedido), realiza Soft Delete (Inativa)
    if (produtoExistente._count.itensPedido > 0) {
      await prisma.produto.update({
        where: { id },
        data: {
          ativo: false,
          estoque: 0,
        }
      })

      return NextResponse.json({
        mensagem: "Produto desativado com sucesso. Ele foi ocultado da loja para preservar o histórico de pedidos existentes.",
        softDelete: true
      })
    }

    // 3. Se não tem histórico de pedidos, exclui permanentemente do Banco de Dados
    await prisma.produto.delete({
      where: { id },
    })

    return NextResponse.json({
      mensagem: "Produto excluído permanentemente com sucesso.",
      softDelete: false
    })
  } catch (error: any) {
    console.error("Erro ao deletar produto:", error)

    return NextResponse.json(
      { error: `Erro interno ao deletar produto: ${error.message || error}` },
      { status: 500 }
    )
  }
}
