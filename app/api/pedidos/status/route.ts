import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { StatusPedido } from "@prisma/client"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "ID do pedido não fornecido" }, { status: 400 })
  }

  try {
    const pedidoId = Number(id)

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        itens: true,
      },
    })

    if (!pedido) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 })
    }

    // Se o pedido ainda estiver PENDENTE e for PIX, verifica se expirou (5 minutos)
    if (pedido.status === StatusPedido.PENDENTE && pedido.metodoPagamento === "pix") {
      const dataCriacao = pedido.criadoEm ? new Date(pedido.criadoEm) : new Date()
      const tempoExpiracao = new Date(dataCriacao.getTime() + 5 * 60 * 1000)
      const agora = new Date()

      if (agora > tempoExpiracao) {
        // Estorna o estoque dos produtos
        for (const item of pedido.itens) {
          await prisma.produto.update({
            where: { id: item.produtoId },
            data: { estoque: { increment: item.quantidade } },
          })
        }

        // Atualiza o pedido para CANCELADO
        const pedidoAtualizado = await prisma.pedido.update({
          where: { id: pedidoId },
          data: { status: StatusPedido.CANCELADO },
        })

        return NextResponse.json({ status: pedidoAtualizado.status })
      }
    }

    return NextResponse.json({ status: pedido.status })
  } catch (error) {
    console.error("Erro ao consultar status do pedido:", error)
    return NextResponse.json({ error: "Erro ao consultar status" }, { status: 500 })
  }
}