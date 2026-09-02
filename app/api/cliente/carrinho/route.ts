import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { jwtVerify } from "jose"

// Auxiliar para extrair o preço final com desconto do produto
function calcularPrecoComDesconto(produto: any): number {
  if (!produto) return 0

  const precoPromocional =
    produto.precoPromocional ??
    produto.preco_promocional ??
    produto.precoPor ??
    produto.preco_por

  const promoNum = Number(precoPromocional)
  if (!isNaN(promoNum) && promoNum > 0) {
    return promoNum
  }

  return Number(produto.preco || 0)
}

// Auxiliar para extrair o cliente autenticado a partir do JWT
async function getClienteLogado() {
  const cookieStore = await cookies()
  const token = cookieStore.get("cliente_token")?.value

  if (!token) return null

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "chave-secreta-fallback"
    )
    const { payload } = await jwtVerify(token, secret)
    const clienteId = payload.id as string

    if (!clienteId) return null

    return await prisma.cliente.findUnique({ where: { id: clienteId } })
  } catch (error) {
    console.error("Erro ao validar JWT no carrinho:", error)
    return null
  }
}

// Auxiliar para obter o estoque correto considerando estoque por tamanho
function obterEstoqueDisponivel(produto: any, tamanhoSelecionado?: string): number {
  if (!produto) return 0

  if (tamanhoSelecionado && produto.estoquePorTamanho) {
    let mapaEstoque: Record<string, number> = {}

    if (typeof produto.estoquePorTamanho === "string") {
      try {
        mapaEstoque = JSON.parse(produto.estoquePorTamanho)
      } catch (e) {
        mapaEstoque = {}
      }
    } else if (typeof produto.estoquePorTamanho === "object") {
      mapaEstoque = produto.estoquePorTamanho
    }

    if (tamanhoSelecionado in mapaEstoque) {
      return Number(mapaEstoque[tamanhoSelecionado]) || 0
    }
  }

  return Number(produto.estoque || 0)
}

// 🟢 GET: Busca o carrinho atual do banco
export async function GET() {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) return NextResponse.json({ itens: [] })

    const carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
      include: {
        itens: {
          include: { produto: true },
        },
      },
    })

    if (!carrinho) return NextResponse.json({ itens: [] })

    const itensFormatados = carrinho.itens.map((item) => {
      const precoCalculado = calcularPrecoComDesconto(item.produto)

      return {
        id: item.produtoId,
        itemId: item.id,
        nome: item.produto.nome,
        preco: precoCalculado,
        precoOriginal: Number(item.produto.preco || 0),
        imagemUrl: item.produto.imagemUrl,
        tamanho: item.tamanho,
        quantidade: item.quantidade,
      }
    })

    return NextResponse.json({ itens: itensFormatados })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🟢 POST: Adiciona item ao carrinho com aviso de estoque (Sem quebrar/estourar erro)
export async function POST(req: Request) {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { produtoId, tamanho, quantidade } = await req.json()
    const qtdDesejada = Number(quantidade) || 1

    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: {
        id: true,
        nome: true,
        estoque: true,
        estoquePorTamanho: true,
      },
    })

    if (!produto) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Produto não encontrado." },
        { status: 200 }
      )
    }

    const estoqueMaximo = obterEstoqueDisponivel(produto, tamanho)

    let carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
    })

    if (!carrinho) {
      carrinho = await prisma.carrinho.create({
        data: { clienteId: cliente.id },
      })
    }

    const itemExistente = await prisma.itemCarrinho.findFirst({
      where: { carrinhoId: carrinho.id, produtoId, tamanho: tamanho || "" },
    })

    const qtdAtualNoCarrinho = itemExistente ? itemExistente.quantidade : 0
    const qtdTotalAposAdicionar = qtdAtualNoCarrinho + qtdDesejada

    // Validação de estoque sem disparar erro HTTP
    if (qtdTotalAposAdicionar > estoqueMaximo) {
      const disponivelParaAdicionar = estoqueMaximo - qtdAtualNoCarrinho

      if (disponivelParaAdicionar <= 0) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: `Você já possui todas as ${estoqueMaximo} unidade(s) do tamanho (${tamanho || "padrão"}) no seu carrinho.`,
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        {
          sucesso: false,
          mensagem: `Restam apenas ${estoqueMaximo} unidade(s) em estoque. Você já possui ${qtdAtualNoCarrinho} no carrinho e só pode adicionar mais ${disponivelParaAdicionar}.`,
        },
        { status: 200 }
      )
    }

    if (itemExistente) {
      await prisma.itemCarrinho.update({
        where: { id: itemExistente.id },
        data: { quantidade: qtdTotalAposAdicionar },
      })
    } else {
      await prisma.itemCarrinho.create({
        data: {
          carrinhoId: carrinho.id,
          produtoId,
          tamanho: tamanho || "",
          quantidade: qtdDesejada,
        },
      })
    }

    return NextResponse.json({ sucesso: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🟢 PATCH: Atualiza quantidade sem disparar erro HTTP
export async function PATCH(req: Request) {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { produtoId, tamanho, quantidade } = await req.json()
    const novaQtd = Number(quantidade)

    const carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
    })
    if (!carrinho) return NextResponse.json({ sucesso: true })

    if (novaQtd <= 0) {
      await prisma.itemCarrinho.deleteMany({
        where: { carrinhoId: carrinho.id, produtoId, tamanho: tamanho || "" },
      })
    } else {
      const produto = await prisma.produto.findUnique({
        where: { id: produtoId },
        select: { estoque: true, estoquePorTamanho: true },
      })

      const estoqueMaximo = obterEstoqueDisponivel(produto, tamanho)

      if (novaQtd > estoqueMaximo) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: `Limite atingido. Máximo disponível em estoque: ${estoqueMaximo}`,
          },
          { status: 200 }
        )
      }

      const item = await prisma.itemCarrinho.findFirst({
        where: { carrinhoId: carrinho.id, produtoId, tamanho: tamanho || "" },
      })

      if (item) {
        await prisma.itemCarrinho.update({
          where: { id: item.id },
          data: { quantidade: novaQtd },
        })
      }
    }

    return NextResponse.json({ sucesso: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🟢 DELETE: Remove item do carrinho
export async function DELETE(req: Request) {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { produtoId, tamanho, limparTudo } = body

    const carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
    })
    if (!carrinho) return NextResponse.json({ sucesso: true })

    if (limparTudo) {
      await prisma.itemCarrinho.deleteMany({
        where: { carrinhoId: carrinho.id },
      })
    } else if (produtoId && tamanho !== undefined) {
      await prisma.itemCarrinho.deleteMany({
        where: { carrinhoId: carrinho.id, produtoId, tamanho },
      })
    }

    return NextResponse.json({ sucesso: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}