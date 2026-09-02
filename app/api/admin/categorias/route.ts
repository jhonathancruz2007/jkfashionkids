import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET: Listar todas as categorias cadastradas
export async function GET() {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: {
        nome: "asc",
      },
    })

    return NextResponse.json(categorias)
  } catch (error: any) {
    console.error("Erro ao buscar categorias:", error)
    return NextResponse.json(
      { erro: "Erro interno ao buscar categorias." },
      { status: 500 }
    )
  }
}

// POST: Criar uma nova categoria
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { nome } = body

    if (!nome || typeof nome !== "string" || !nome.trim()) {
      return NextResponse.json(
        { erro: "O nome da categoria é obrigatório." },
        { status: 400 }
      )
    }

    const nomeFormatado = nome.trim()

    // Verifica se a categoria já existe no banco
    const categoriaExistente = await prisma.categoria.findUnique({
      where: { nome: nomeFormatado },
    })

    if (categoriaExistente) {
      return NextResponse.json(
        { erro: "Já existe uma categoria com este nome." },
        { status: 400 }
      )
    }

    // Cria a categoria usando o nome como ID
    const novaCategoria = await prisma.categoria.create({
      data: {
        nome: nomeFormatado,
      },
    })

    return NextResponse.json(novaCategoria, { status: 201 })
  } catch (error: any) {
    console.error("Erro ao criar categoria:", error)
    return NextResponse.json(
      { erro: `Erro no banco de dados: ${error.message || error}` },
      { status: 500 }
    )
  }
}