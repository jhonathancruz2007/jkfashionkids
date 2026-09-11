import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import nodemailer from 'nodemailer'

// Configuração do transportador de e-mail (Certifique-se de configurar suas variáveis no .env)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// Função auxiliar para envio de WhatsApp (Integre aqui com sua API de preferência: Evolution, Z-API, etc.)
async function enviarMensagemWhatsApp(telefone: string, mensagem: string) {
  if (!telefone) return
  
  try {
    /* Exemplo com fetch para uma API de WhatsApp externa:
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

    // 1. Atualiza o status do pedido no banco de dados e traz os dados do cliente vinculado
    const pedidoAtualizado = await db.pedido.update({
      where: { id },
      data: { status },
      include: {
        cliente: true, // Traz os dados do cliente (nome, email, telefone)
        itens: true,
      },
    })

    // 2. Verifica se o status foi alterado para "PAGO" (ou "Pago") para disparar as notificações
    if (status.toUpperCase() === 'PAGO') {
      const cliente = (pedidoAtualizado as any).cliente

      if (cliente) {
        const primeiroNome = cliente.nome ? cliente.nome.split(' ')[0] : 'Cliente'
        const idCurto = pedidoAtualizado.id.slice(0, 6)

        // A) Disparar E-mail
        if (cliente.email) {
          const mailOptions = {
            from: `"JK Fashion Kids" <${process.env.EMAIL_USER}>`,
            to: cliente.email,
            subject: `Pagamento Aprovado! Pedido #${idCurto}`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
                <h2>Olá, ${primeiroNome}! 🎉</h2>
                <p>Recebemos a confirmação do pagamento do seu pedido <strong>#${idCurto}</strong>.</p>
                <p>Já estamos separando e preparando tudo com muito carinho para envio!</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p>Obrigado por comprar conosco!</p>
              </div>
            `,
          }

          transporter.sendMail(mailOptions).catch((err) => {
            console.error('❌ Erro ao enviar e-mail transacional:', err)
          })
        }

        // B) Disparar WhatsApp
        if (cliente.telefone) {
          const textoWhatsapp = `Olá ${primeiroNome}! 🌟 Passando para avisar que o pagamento do seu pedido #${idCurto} foi aprovado com sucesso! Já estamos separando seus produtos. Agradecemos pela preferência! 📦✨`
          
          await enviarMensagemWhatsApp(cliente.telefone, textoWhatsapp)
        }
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
