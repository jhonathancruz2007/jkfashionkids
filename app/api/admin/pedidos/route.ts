import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET: Listar todos os pedidos
export async function GET() {
  try {
    const pedidos = await prisma.pedido.findMany({
      include: {
        cliente: {
          select: {
            nome: true,
            email: true,
          },
        },
        itens: {
          include: {
            produto: {
              select: {
                nome: true,
                imagemUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(pedidos)
  } catch (error) {
    console.error("Erro ao buscar pedidos:", error)
    return NextResponse.json(
      { error: "Erro interno ao buscar pedidos." },
      { status: 500 }
    )
  }
}