import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET: Buscar todos os clientes
export async function GET() {
  try {
    const clientes = await prisma.cliente.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(clientes)
  } catch (error) {
    console.error("Erro ao buscar clientes:", error)
    return NextResponse.json(
      { error: "Erro interno ao carregar clientes." },
      { status: 500 }
    )
  }
}