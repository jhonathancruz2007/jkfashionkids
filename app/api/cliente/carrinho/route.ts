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

function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
}

function normalizarTamanho(valor: unknown): string {
  return String(valor ?? "").trim()
}

function normalizarCor(valor: unknown): string | null {
  const cor = String(valor ?? "").trim()
  return cor ? cor : null
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

// Auxiliar para obter o estoque correto considerando tamanho e cor.
// Aceita:
// 1) estoquePorTamanho = { P: 2, M: 3 }
// 2) estoquePorCor = { Azul: 5 }
// 3) estoquePorCor = { Azul: { P: 2, M: 3 } }
function obterEstoqueDisponivel(
  produto: any,
  tamanhoSelecionado?: string,
  corSelecionada?: string | null
): number {
  if (!produto) return 0

  let mapaEstoquePorTamanho: Record<string, any> = {}
  let mapaEstoquePorCor: Record<string, any> = {}

  if (produto.estoquePorTamanho) {
    if (typeof produto.estoquePorTamanho === "string") {
      try {
        mapaEstoquePorTamanho = JSON.parse(produto.estoquePorTamanho) || {}
      } catch {
        mapaEstoquePorTamanho = {}
      }
    } else if (
      typeof produto.estoquePorTamanho === "object" &&
      !Array.isArray(produto.estoquePorTamanho)
    ) {
      mapaEstoquePorTamanho = produto.estoquePorTamanho
    }
  }

  if (produto.estoquePorCor) {
    if (typeof produto.estoquePorCor === "string") {
      try {
        mapaEstoquePorCor = JSON.parse(produto.estoquePorCor) || {}
      } catch {
        mapaEstoquePorCor = {}
      }
    } else if (
      typeof produto.estoquePorCor === "object" &&
      !Array.isArray(produto.estoquePorCor)
    ) {
      mapaEstoquePorCor = produto.estoquePorCor
    }
  }

  const tamanho = normalizarTamanho(tamanhoSelecionado)
  const tamanhoNorm = normalizarTexto(tamanho)
  const cor = normalizarCor(corSelecionada)
  const corNorm = normalizarTexto(cor)

  // Primeiro: COR + TAMANHO (matriz)
  if (corNorm) {
    const chaveCor = Object.keys(mapaEstoquePorCor).find(
      (chave) => normalizarTexto(chave) === corNorm
    )

    if (chaveCor) {
      const estoqueDaCor = mapaEstoquePorCor[chaveCor]

      // Cor com estoque numérico
      if (typeof estoqueDaCor === "number") {
        return Math.max(0, Number(estoqueDaCor) || 0)
      }

      // Cor com matriz por tamanho
      if (
        estoqueDaCor &&
        typeof estoqueDaCor === "object" &&
        !Array.isArray(estoqueDaCor)
      ) {
        const chaveTamanho = Object.keys(estoqueDaCor).find(
          (chave) => normalizarTexto(chave) === tamanhoNorm
        )

        if (chaveTamanho) {
          return Math.max(0, Number(estoqueDaCor[chaveTamanho]) || 0)
        }

        // Se foi escolhida uma cor e ela possui matriz, mas o tamanho
        // informado não existe, não usa o estoque geral dessa cor.
        if (tamanhoNorm) return 0
      }
    }
  }

  // Segundo: TAMANHO
  if (tamanhoNorm && Object.keys(mapaEstoquePorTamanho).length > 0) {
    const chaveTamanho = Object.keys(mapaEstoquePorTamanho).find(
      (chave) => normalizarTexto(chave) === tamanhoNorm
    )

    if (chaveTamanho) {
      return Math.max(
        0,
        Number(mapaEstoquePorTamanho[chaveTamanho]) || 0
      )
    }

    return 0
  }

  // Terceiro: estoque geral
  return Math.max(0, Number(produto.estoque || 0))
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
        produtoId: item.produtoId,
        nome: item.produto.nome,
        preco: precoCalculado,
        precoOriginal: Number(item.produto.preco || 0),
        imagemUrl: item.produto.imagemUrl,
        tamanho: item.tamanho,
        cor: item.cor || null,
        quantidade: item.quantidade,
      }
    })

    return NextResponse.json(
      { itens: itensFormatados },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🟢 POST: Adiciona item ao carrinho preservando TAMANHO + COR
export async function POST(req: Request) {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const produtoId = String(body?.produtoId || "").trim()
    const tamanho = normalizarTamanho(body?.tamanho)
    const cor = normalizarCor(body?.cor)
    const qtdDesejada = Number(body?.quantidade) || 1

    if (!produtoId) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Produto não informado." },
        { status: 400 }
      )
    }

    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: {
        id: true,
        nome: true,
        estoque: true,
        estoquePorTamanho: true,
        estoquePorCor: true,
      },
    })

    if (!produto) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Produto não encontrado." },
        { status: 200 }
      )
    }

    const estoqueMaximo = obterEstoqueDisponivel(produto, tamanho, cor)

    let carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
    })

    if (!carrinho) {
      carrinho = await prisma.carrinho.create({
        data: { clienteId: cliente.id },
      })
    }

    // IMPORTANTE: o item agora é identificado por PRODUTO + TAMANHO + COR.
    // Isso permite ter, por exemplo, M Azul e M Rosa no mesmo carrinho.
    const itemExistente = await prisma.itemCarrinho.findFirst({
      where: {
        carrinhoId: carrinho.id,
        produtoId,
        tamanho,
        cor,
      },
    })

    const qtdAtualNoCarrinho = itemExistente ? itemExistente.quantidade : 0
    const qtdTotalAposAdicionar = qtdAtualNoCarrinho + qtdDesejada

    if (qtdTotalAposAdicionar > estoqueMaximo) {
      const disponivelParaAdicionar = estoqueMaximo - qtdAtualNoCarrinho

      if (disponivelParaAdicionar <= 0) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: cor
              ? `Você já possui todas as ${estoqueMaximo} unidade(s) disponíveis da cor ${cor}${tamanho ? ` no tamanho ${tamanho}` : ""} no seu carrinho.`
              : `Você já possui todas as ${estoqueMaximo} unidade(s) do tamanho (${tamanho || "padrão"}) no seu carrinho.`,
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        {
          sucesso: false,
          mensagem: cor
            ? `Restam apenas ${estoqueMaximo} unidade(s) disponíveis da cor ${cor}${tamanho ? ` no tamanho ${tamanho}` : ""}. Você já possui ${qtdAtualNoCarrinho} no carrinho e só pode adicionar mais ${disponivelParaAdicionar}.`
            : `Restam apenas ${estoqueMaximo} unidade(s) em estoque. Você já possui ${qtdAtualNoCarrinho} no carrinho e só pode adicionar mais ${disponivelParaAdicionar}.`,
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
          tamanho,
          cor,
          quantidade: qtdDesejada,
        },
      })
    }

    return NextResponse.json({
      sucesso: true,
      item: {
        produtoId,
        tamanho,
        cor,
        quantidade: itemExistente ? qtdTotalAposAdicionar : qtdDesejada,
      },
    })
  } catch (error: any) {
    console.error("Erro ao adicionar item ao carrinho:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🟢 PATCH: Atualiza quantidade preservando PRODUTO + TAMANHO + COR
export async function PATCH(req: Request) {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const produtoId = String(body?.produtoId || "").trim()
    const tamanho = normalizarTamanho(body?.tamanho)
    const cor = normalizarCor(body?.cor)
    const novaQtd = Number(body?.quantidade)

    const carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
    })
    if (!carrinho) return NextResponse.json({ sucesso: true })

    const item = await prisma.itemCarrinho.findFirst({
      where: {
        carrinhoId: carrinho.id,
        produtoId,
        tamanho,
        cor,
      },
    })

    if (novaQtd <= 0) {
      if (item) {
        await prisma.itemCarrinho.delete({ where: { id: item.id } })
      }

      return NextResponse.json({ sucesso: true })
    }

    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: {
        estoque: true,
        estoquePorTamanho: true,
        estoquePorCor: true,
      },
    })

    const estoqueMaximo = obterEstoqueDisponivel(produto, tamanho, cor)

    if (novaQtd > estoqueMaximo) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: cor
            ? `Limite atingido para ${cor}${tamanho ? ` / ${tamanho}` : ""}. Máximo disponível em estoque: ${estoqueMaximo}`
            : `Limite atingido. Máximo disponível em estoque: ${estoqueMaximo}`,
        },
        { status: 200 }
      )
    }

    if (item) {
      await prisma.itemCarrinho.update({
        where: { id: item.id },
        data: { quantidade: novaQtd },
      })
    }

    return NextResponse.json({ sucesso: true })
  } catch (error: any) {
    console.error("Erro ao atualizar item do carrinho:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// 🟢 DELETE: Remove item preservando PRODUTO + TAMANHO + COR
export async function DELETE(req: Request) {
  try {
    const cliente = await getClienteLogado()
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const produtoId = String(body?.produtoId || "").trim()
    const tamanho = body?.tamanho !== undefined ? normalizarTamanho(body.tamanho) : ""
    const cor = normalizarCor(body?.cor)
    const limparTudo = Boolean(body?.limparTudo)

    const carrinho = await prisma.carrinho.findUnique({
      where: { clienteId: cliente.id },
    })
    if (!carrinho) return NextResponse.json({ sucesso: true })

    if (limparTudo) {
      await prisma.itemCarrinho.deleteMany({
        where: { carrinhoId: carrinho.id },
      })
    } else if (produtoId && body?.tamanho !== undefined) {
      await prisma.itemCarrinho.deleteMany({
        where: {
          carrinhoId: carrinho.id,
          produtoId,
          tamanho,
          cor,
        },
      })
    }

    return NextResponse.json({ sucesso: true })
  } catch (error: any) {
    console.error("Erro ao remover item do carrinho:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
