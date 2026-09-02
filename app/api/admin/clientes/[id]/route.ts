import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// PUT: Alterar o tipo de conta (ROLE) do cliente
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams
    const body = await request.json()
    const { role } = body

    if (!role || !["CLIENTE", "ADMIN"].includes(role)) {
      return NextResponse.json(
        { error: "Role inválida." },
        { status: 400 }
      )
    }

    const clienteAtualizado = await prisma.cliente.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
      },
    })

    return NextResponse.json(clienteAtualizado)
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error)
    return NextResponse.json(
      { error: "Erro ao atualizar permissão do cliente." },
      { status: 500 }
    )
  }
}

// DELETE: Deletar conta de cliente
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const { id } = resolvedParams

    await prisma.cliente.delete({
      where: { id },
    })

    return NextResponse.json({ ok: true, message: "Cliente removido com sucesso." })
  } catch (error) {
    console.error("Erro ao excluir cliente:", error)
    return NextResponse.json(
      { error: "Erro ao excluir cliente." },
      { status: 500 }
    )
  }
}