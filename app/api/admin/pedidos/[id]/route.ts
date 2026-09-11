import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import nodemailer from 'nodemailer'

// Configuração do transportador de e-mail usando contato@jkfashionkids.com.br
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER, // Variável com o e-mail (ou senha específica de app)
    pass: process.env.EMAIL_PASS,
  },
})

// Função auxiliar para envio de WhatsApp
async function enviarMensagemWhatsApp(telefone: string, mensagem: string) {
  if (!telefone) return
  
  try {
    /* Exemplo com fetch para uma API de WhatsApp externa (Evolution, Z-API, etc.):
    await fetch('https://sua-api-whatsapp.com/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer SEU_TOKEN' },
      body: JSON.stringify({ phone: telefone, message: mensagem })
    })
    */
    console.log(`[WHATSAPP DISPARADO] Para: ${telefone} | Mensagem: "${mensagem}"`)
  } catch (erro) {
    console.error('❌ Erro ao enviar WhatsApp:', erro)
  }
}

// ==========================================
// 1. MÉTODO PUT: Atualizar o status do pedido e notificar
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

    // 1. Atualiza o status do pedido no banco de dados e traz os dados do cliente
    const pedidoAtualizado = await db.pedido.update({
      where: { id },
      data: { status },
      include: {
        cliente: true,
        itens: true,
      },
    })

    // 2. Verifica se o status foi alterado para "PAGO" para disparar as notificações
    if (status.toUpperCase() === 'PAGO') {
      const cliente = (pedidoAtualizado as any).cliente
      const primeiroNome = cliente?.nome ? cliente.nome.split(' ')[0] : 'Cliente'
      const idCurto = pedidoAtualizado.id.slice(0, 6)

      // A) Disparar E-mail para o cliente (remetente fixo: contato@jkfashionkids.com.br)
      if (cliente?.email) {
        const mailOptions = {
          from: `"JK Fashion Kids" <contato@jkfashionkids.com.br>`,
          to: cliente.email,
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
        }

        transporter.sendMail(mailOptions).catch((err) => {
          console.error('❌ Erro ao enviar e-mail transacional:', err)
        })
      }

      // B) Disparar WhatsApp de aviso interno para a loja (551933010493)
      const mensagemAdmin = `🔔 *NOVO PEDIDO PAGO!*\n\nO pedido *#${idCurto}* de ${primeiroNome} foi aprovado com sucesso! Já pode iniciar a separação dos produtos. 📦✨`
      await enviarMensagemWhatsApp('551933010493', mensagemAdmin)

      // C) Disparar WhatsApp para o cliente (se ele tiver telefone cadastrado)
      if (cliente?.telefone) {
        const mensagemCliente = `Olá ${primeiroNome}! 🌟 Passando para avisar que o pagamento do seu pedido #${idCurto} foi aprovado com sucesso! Agradecemos pela preferência! 💖`
        await enviarMensagemWhatsApp(cliente.telefone, mensagemCliente)
      }
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Status do pedido atualizado e notificações processadas com sucesso!',
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
    const resolvedParams = await params
    const id = resolvedParams.id

    if (!id) {
      return NextResponse.json({ error: 'ID do pedido não informado.' }, { status: 400 })
    }

    await db.$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id },
        include: {
          itens: true,
        },
      })

      if (!pedido) {
        throw new Error('Pedido não encontrado.')
      }

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
                const estoqueAtualDoTamanho = Number(estoqueObj[chaveTamanho] || 0)
                estoqueObj[chaveTamanho] = estoqueAtualDoTamanho + quantidadeDevolvida

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

      await tx.itemPedido.deleteMany({
        where: { pedidoId: id },
      })

      await tx.pedido.delete({
        where: { id },
      })
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
