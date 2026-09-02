import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Como o id no banco é text (UUID), passamos direto como string
    await db.tamanho.delete({
      where: { id: String(id) },
    })

    return NextResponse.json({ sucesso: true }, { status: 200 })
  } catch (error: any) {
    console.error("Erro ao deletar tamanho no banco:", error)
    return NextResponse.json(
      { erro: "Não foi possível excluir o tamanho no banco de dados." },
      { status: 500 }
    )
  }
}