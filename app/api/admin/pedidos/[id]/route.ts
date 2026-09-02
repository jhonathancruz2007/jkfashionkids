import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ==========================================
// 1. MÉTODO PUT: Atualizar o status do pedido
// ==========================================
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const id = resolvedParams.id
    const body = await request.json()
    const { status } = body

    if (!id) {
      return NextResponse.json({ error: 'ID do pedido não informado.' }, { status: 400 })
    }

    if (!status) {
      return NextResponse.json({ error: 'O novo status é obrigatório.' }, { status: 400 })
    }

    // Atualiza o status do pedido no banco de dados
    const pedidoAtualizado = await db.pedido.update({
      where: { id },
      data: { status },
    })

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Status do pedido atualizado com sucesso!',
      pedido: pedidoAtualizado,
    })
  } catch (erro: any) {
    console.error('❌ Erro ao atualizar status do pedido:', erro)
    return NextResponse.json(
      { error: erro.message || 'Erro ao tentar atualizar o status do pedido.' },
      { status: 500 }
    )
  }
}

// ==========================================
// 2. MÉTODO DELETE: Excluir a venda e devolver itens ao estoque
// ==========================================
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Compatibilidade para Next.js 14 e 15 (resolve Promise de params se necessário)
    const resolvedParams = await params
    const id = resolvedParams.id

    if (!id) {
      return NextResponse.json({ error: 'ID do pedido não informado.' }, { status: 400 })
    }

    // Executa a transação atômica no banco de dados
    await db.$transaction(async (tx) => {
      // 1. Busca o pedido e seus itens associados
      const pedido = await tx.pedido.findUnique({
        where: { id },
        include: {
          itens: true,
        },
      })

      if (!pedido) {
        throw new Error('Pedido não encontrado.')
      }

      // 2. Devolve cada item comprado de volta ao estoque (geral e por tamanho)
      for (const item of pedido.itens) {
        const produtoId = (item as any).produtoId || (item as any).id
        const quantidadeDevolvida = Number(item.quantidade || 1)
        const tamanhoEscolhido = (item as any).tamanho ? String((item as any).tamanho).trim().toUpperCase() : null

        if (produtoId) {
          const produto = await tx.produto.findUnique({
            where: { id: produtoId },
          })

          if (produto) {
            const estoqueAtualGeral = Number(produto.estoque ?? (produto as any).quantidade ?? 0)

            // Lê os tamanhos e estoques salvos no produto
            let brutoTamanhos = produto.estoquePorTamanho ?? (produto as any).tamanhos
            let estoqueObj: Record<string, number> = {}
            let temTamanhosControlados = false

            if (typeof brutoTamanhos === "string") {
              try {
                estoqueObj = JSON.parse(brutoTamanhos)
                temTamanhosControlados = Object.keys(estoqueObj).length > 0
              } catch {
                estoqueObj = {}
              }
            } else if (brutoTamanhos && typeof brutoTamanhos === "object" && !Array.isArray(brutoTamanhos)) {
              estoqueObj = { ...(brutoTamanhos as Record<string, number>) }
              temTamanhosControlados = Object.keys(estoqueObj).length > 0
            }

            const updateData: any = {}

            // Se o produto usa controle por tamanho e o item comprado tinha tamanho
            if (tamanhoEscolhido && temTamanhosControlados) {
              const chaveTamanho = Object.keys(estoqueObj).find(
                (k) => k.toUpperCase() === tamanhoEscolhido
              )

              if (chaveTamanho) {
                const estoqueAtualDoTamanho = Number(estoqueObj[chaveTamanho] || 0)
                // Devolve a quantidade para o tamanho específico
                estoqueObj[chaveTamanho] = estoqueAtualDoTamanho + quantidadeDevolvida

                // Recalcula o estoque total somando todos os tamanhos
                const novoEstoqueTotal = Object.values(estoqueObj).reduce(
                  (acc: number, val: any) => acc + (Number(val) || 0),
                  0
                )

                if ("estoque" in produto) updateData.estoque = novoEstoqueTotal
                if ("quantidade" in produto) updateData.quantidade = novoEstoqueTotal

                if ("estoquePorTamanho" in produto && produto.estoquePorTamanho !== null) {
                  updateData.estoquePorTamanho =
                    typeof produto.estoquePorTamanho === "string"
                      ? JSON.stringify(estoqueObj)
                      : estoqueObj
                }
              } else {
                // Caso o tamanho não exista mais no objeto, devolve para o geral por segurança
                const novoEstoque = estoqueAtualGeral + quantidadeDevolvida
                if ("estoque" in produto) updateData.estoque = novoEstoque
                if ("quantidade" in produto) updateData.quantidade = novoEstoque
              }
            } else {
              // Se não usa tamanhos, devolve apenas para o estoque geral
              const novoEstoque = estoqueAtualGeral + quantidadeDevolvida
              if ("estoque" in produto) updateData.estoque = novoEstoque
              if ("quantidade" in produto) updateData.quantidade = novoEstoque
            }

            if (Object.keys(updateData).length === 0) {
              updateData.estoque = estoqueAtualGeral + quantidadeDevolvida
            }

            await tx.produto.update({
              where: { id: produtoId },
              data: updateData,
            })
          }
        }
      }

      // 3. Deleta os itens vinculados ao pedido
      await tx.itemPedido.deleteMany({
        where: { pedidoId: id },
      })

      // 4. Deleta o registro do pedido
      await tx.pedido.delete({
        where: { id },
      })
    })

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Venda excluída e itens devolvidos ao estoque (geral e por tamanho) com sucesso!',
    })
  } catch (erro: any) {
    console.error('❌ Erro ao excluir venda:', erro)
    return NextResponse.json(
      { error: erro.message || 'Erro ao tentar excluir a venda.' },
      { status: 500 }
    )
  }
}