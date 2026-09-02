import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const ORDEM_TAMANHOS = [
  'RN', 'P', 'M', 'G', 'GG', 
  '1', '2', '3', '4', '6', '8', '10', '12', '14', '16',
  'ÚNICO', 'UNICO'
]

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

export async function resolverCategoria(input: any): Promise<{ nome: string } | { id: string } | null> {
  if (!input) return null

  let valorStr = ""
  if (typeof input === "object") {
    valorStr = String(input.nome || input.id || "").trim()
  } else {
    valorStr = String(input).trim()
  }

  if (!valorStr) return null

  const valoresNulos = ["null", "undefined", "none", "0", "sem-categoria", "selecione", ""]
  if (valoresNulos.includes(valorStr.toLowerCase())) return null

  let cat = await prisma.categoria.findFirst({
    where: {
      nome: { equals: valorStr, mode: "insensitive" },
    },
  })

  if (!cat) {
    const nomeFormatado = valorStr
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/(^\w|\s\w)/g, (l) => l.toUpperCase())

    try {
      cat = await prisma.categoria.create({
        data: { nome: nomeFormatado },
      })
    } catch {
      cat = await prisma.categoria.findFirst({
        where: { nome: { equals: nomeFormatado, mode: "insensitive" } },
      })
    }
  }

  if (!cat) return null

  return (cat as any).id ? { id: (cat as any).id } : { nome: (cat as any).nome }
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
      return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 })
    }

    return NextResponse.json(produto)
  } catch (error) {
    console.error("Erro ao buscar produto:", error)
    return NextResponse.json(
      { erro: "Erro interno ao buscar produto." },
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
    } = body

    if (!nome || typeof nome !== "string" || !nome.trim()) {
      return NextResponse.json({ erro: "O campo Nome é obrigatório." }, { status: 400 })
    }

    if (!descricao || typeof descricao !== "string" || !descricao.trim()) {
      return NextResponse.json({ erro: "O campo Descrição é obrigatório." }, { status: 400 })
    }

    if (preco === undefined || preco === null || preco === "" || isNaN(Number(String(preco).replace(',', '.')))) {
      return NextResponse.json({ erro: "O campo Preço é obrigatório e deve ser um número válido." }, { status: 400 })
    }

    if (!imagemUrl || typeof imagemUrl !== "string" || !imagemUrl.trim()) {
      return NextResponse.json({ erro: "A imagem principal do produto é obrigatória." }, { status: 400 })
    }

    const tamanhosOrdenados = processarTamanhos(tamanhos)

    let estoqueTotalNum = parseInt(estoque) || 0
    let estoquePorTamanhoFinal = estoquePorTamanho

    // Limpa o estoquePorTamanho para manter APENAS os tamanhos selecionados no momento
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

    const precoNum = parseFloat(String(preco).replace(',', '.'))
    const precoPromoNum = precoPromocional ? parseFloat(String(precoPromocional).replace(',', '.')) : null

    // Montagem dinâmica dos dados
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
    }

    // Se a categoria for removida/nula no formulário, limpa o relacionamento explicitamente no banco
    const catRef = await resolverCategoria(categoriaId)
    if (catRef) {
      if ('id' in catRef) {
        updateData.categoriaId = catRef.id
      } else if ('nome' in catRef) {
        updateData.categoria = { connect: { nome: catRef.nome } }
      }
    } else {
      updateData.categoriaId = null
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
      { erro: `Erro no Banco de Dados: ${error.message || error}` },
      { status: 500 }
    )
  }
}

// DELETE: Deletar produto pelo ID
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    await prisma.produto.delete({
      where: { id: resolvedParams.id },
    })

    return NextResponse.json({ mensagem: "Produto excluído com sucesso." })
  } catch (error: any) {
    console.error("Erro ao deletar produto:", error)
    return NextResponse.json(
      { erro: "Erro interno ao deletar produto." },
      { status: 500 }
    )
  }
}