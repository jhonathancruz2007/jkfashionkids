import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// DELETE: Excluir uma categoria por ID ou por Nome
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const idOrName = decodeURIComponent(resolvedParams.id)

    if (!idOrName) {
      return NextResponse.json(
        { erro: "ID ou nome da categoria é obrigatório." },
        { status: 400 }
      )
    }

    // Tenta deletar tanto por 'id' quanto por 'nome' para garantir compatibilidade com o schema do Prisma
    const resultado = await prisma.categoria.delete({
  where: {
    nome: idOrName, // passe o nome vindo do parâmetro da rota
  },
});

    if (resultado.count === 0) {
      return NextResponse.json(
        { erro: "Categoria não encontrada no banco de dados." },
        { status: 404 }
      )
    }

    return NextResponse.json({ mensagem: "Categoria excluída com sucesso." })
  } catch (error: any) {
    console.error("Erro ao excluir categoria:", error)
    return NextResponse.json(
      { erro: `Erro no banco de dados: ${error.message || error}` },
      { status: 500 }
    )
  }
}