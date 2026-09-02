import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Extrai o ID do pedido retornado na notificação do gateway
    const orderId = body.order_id || body.data?.order_id || body.metadata?.order_id
    const statusNotificacao = body.event || body.status

    if ((statusNotificacao === "payment.approved" || statusNotificacao === "paid") && orderId) {
      // 1. Atualiza o status do pedido para PAGO
      const pedidoAtualizado = await prisma.pedido.update({
        where: { id: orderId },
        data: { status: "PAGO" },
        include: { itens: true },
      })

      // 2. Decrementa o estoque total dos produtos comprados
      for (const item of pedidoAtualizado.itens) {
        await prisma.produto.update({
          where: { id: item.produtoId },
          data: {
            estoque: {
              decrement: item.quantidade,
            },
          },
        })
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error("Erro ao processar webhook da InfinitePay:", error)
    return NextResponse.json({ error: "Erro no processamento do webhook" }, { status: 500 })
  }
}