import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// DELETE: Excluir um tamanho por ID ou por Nome
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const idOrName = decodeURIComponent(resolvedParams.id)

    if (!idOrName) {
      return NextResponse.json(
        { erro: "ID ou nome do tamanho é obrigatório." },
        { status: 400 }
      )
    }

    // Identifica se o parâmetro recebido é um UUID ou o nome do tamanho
    const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(idOrName)

    const tamanhoExistente = await prisma.tamanho.findFirst({
      where: isUUID ? { id: idOrName } : { nome: idOrName }
    })

    if (!tamanhoExistente) {
      return NextResponse.json(
        { erro: "Tamanho não encontrado no banco de dados." },
        { status: 404 }
      )
    }

    // Exclui o tamanho pelo ID do registro encontrado
    await prisma.tamanho.delete({
      where: { id: tamanhoExistente.id },
    })

    return NextResponse.json({ mensagem: "Tamanho excluído com sucesso." })
  } catch (error: any) {
    console.error("Erro ao excluir tamanho:", error)
    return NextResponse.json(
      { erro: `Erro no banco de dados: ${error.message || error}` },
      { status: 500 }
    )
  }
}
