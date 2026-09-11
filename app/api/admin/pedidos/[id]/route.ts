import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Resend } from 'resend'

// Inicializa a Resend com a chave de API
const resend = new Resend(process.env.RESEND_API_KEY)

// Função auxiliar para geração do link do WhatsApp (Opção 2)
async function enviarMensagemWhatsApp(telefone: string, mensagem: string) {
  if (!telefone) return

  try {
    // Remove qualquer caractere não numérico
    const numerosLimpos = telefone.replace(/\D/g, '')

    // Garante que o DDI 55 (Brasil) esteja presente se o número tiver 10 ou 11 dígitos
    let telefoneFormatado = numerosLimpos
    if (numerosLimpos.length === 10 || numerosLimpos.length === 11) {
      telefoneFormatado = `55${numerosLimpos}`
    }

    // Codifica a mensagem para o padrão de URL (espaços viram %20, acentos, etc.)
    const mensagemCodificada = encodeURIComponent(mensagem)
    const linkWhatsApp = `https://wa.me/${telefoneFormatado}?text=${mensagemCodificada}`

    console.log(`✅ [LINK WHATSAPP GERADO] Destino: ${telefoneFormatado}`)
    console.log(`🔗 Link: ${linkWhatsApp}`)
    
    return linkWhatsApp
  } catch (erro) {
    console.error('❌ Erro ao gerar link do WhatsApp:', erro)
  }
}

// ==========================================
// 1. MÉTODO PUT: Atualizar o status e notificar
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

    if (!id || !status) {
      return NextResponse.json({ error: 'ID ou status não informados.' }, { status: 400 })
    }

    // Atualiza o pedido no banco
    const pedidoAtualizado = await db.pedido.update({
      where: { id },
      data: { status },
      include: {
        cliente: true,
        itens: true,
      },
    })

    // Se o status for PAGO, dispara as notificações
    if (status.toUpperCase() === 'PAGO') {
      const cliente = (pedidoAtualizado as any).cliente
      const primeiroNome = cliente?.nome ? cliente.nome.split(' ')[0] : 'Cliente'
      const idCurto = pedidoAtualizado.id.slice(0, 6)

      // A) Enviar E-mail via Resend (API HTTP segura)
      if (cliente?.email) {
        try {
          await resend.emails.send({
            from: 'JK Fashion Kids <contato@jkfashionkids.com.br>',
            to: [cliente.email],
            subject: `Pagamento Aprovado! Pedido #${idCurto}`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
                <h2>Olá, ${primeiroNome}! 🎉</h2>
                <p>Recebemos a confirmação do pagamento do seu pedido <strong>#${idCurto}</strong>.</p>
                <p>Já estamos separando e preparando tudo com muito carinho para envio!</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p>Obrigado por comprar conosco na <strong>JK Fashion Kids</strong>!</p>
              </div>
            `,
          })
          console.log(`✅ [E-MAIL ENVIADO VIA RESEND] Para: ${cliente.email}`)
        } catch (emailErr: any) {
          console.error('❌ Erro ao enviar e-mail pela Resend:', emailErr)
        }
      }

      // B) WhatsApp interno para a loja (551933010493)
      const mensagemAdmin = `🔔 *NOVO PEDIDO PAGO!*\n\nO pedido *#${idCurto}* de ${primeiroNome} foi aprovado com sucesso! Já pode iniciar a separação dos produtos. 📦✨`
      await enviarMensagemWhatsApp('551933010493', mensagemAdmin)

      // C) WhatsApp para o cliente
      if (cliente?.telefone) {
        const mensagemCliente = `Olá ${primeiroNome}! 🌟 Passando para avisar que o pagamento do seu pedido #${idCurto} foi aprovado com sucesso! Agradecemos pela preferência! 💖`
        await enviarMensagemWhatsApp(cliente.telefone, mensagemCliente)
      }
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Status atualizado e notificações processadas com sucesso!',
      pedido: pedidoAtualizado,
    })
  } catch (erro: any) {
    console.error('❌ Erro na rota PUT:', erro)
    return NextResponse.json(
      { error: erro.message || 'Erro ao atualizar pedido.' },
      { status: 500 }
    )
  }
}

// ==========================================
// 2. MÉTODO DELETE: Excluir venda e devolver estoque
// ==========================================
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params
    const id = resolvedParams.id

    if (!id) {
      return NextResponse.json({ error: 'ID do pedido não informado.' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id },
        include: { itens: true },
      })

      if (!pedido) throw new Error('Pedido não encontrado.')

      for (const item of pedido.itens) {
        const produtoId = (item as any).produtoId || (item as any).id
        const quantidadeDevolvida = Number(item.quantidade || 1)
        const tamanhoEscolhido = (item as any).tamanho ? String((item as any).tamanho).trim().toUpperCase() : null

        if (produtoId) {
          const produto = await tx.produto.findUnique({ where: { id: produtoId } })

          if (produto) {
            const estoqueAtualGeral = Number(produto.estoque ?? (produto as any).quantidade ?? 0)
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

            if (tamanhoEscolhido && temTamanhosControlados) {
              const chaveTamanho = Object.keys(estoqueObj).find(
                (k) => k.toUpperCase() === tamanhoEscolhido
              )

              if (chaveTamanho) {
                estoqueObj[chaveTamanho] = Number(estoqueObj[chaveTamanho] || 0) + quantidadeDevolvida
                const novoEstoqueTotal = Object.values(estoqueObj).reduce(
                  (acc: number, val: any) => acc + (Number(val) || 0),
                  0
                )
                if ("estoque" in produto) updateData.estoque = novoEstoqueTotal
                if ("quantidade" in produto) updateData.quantidade = novoEstoqueTotal
                if ("estoquePorTamanho" in produto && produto.estoquePorTamanho !== null) {
                  updateData.estoquePorTamanho = typeof produto.estoquePorTamanho === "string" ? JSON.stringify(estoqueObj) : estoqueObj
                }
              } else {
                const novoEstoque = estoqueAtualGeral + quantidadeDevolvida
                if ("estoque" in produto) updateData.estoque = novoEstoque
                if ("quantidade" in produto) updateData.quantidade = novoEstoque
              }
            } else {
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

      await tx.itemPedido.deleteMany({ where: { pedidoId: id } })
      await tx.pedido.delete({ where: { id } })
    })

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Venda excluída e itens devolvidos ao estoque com sucesso!',
    })
  } catch (erro: any) {
    console.error('❌ Erro ao excluir venda:', erro)
    return NextResponse.json(
      { error: erro.message || 'Erro ao tentar excluir a venda.' },
      { status: 500 }
    )
  }
}
