import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const TINY_TOKEN = process.env.TINY_API_TOKEN

// Função auxiliar para enviar o pedido aprovado para o Tiny ERP
async function enviarPedidoParaTiny(pedido: any) {
  if (!TINY_TOKEN) {
    console.warn('⚠️ Token do Tiny não configurado nas variáveis de ambiente.')
    return
  }

  try {
    const cliente = pedido.cliente
    const itensFormatados = pedido.itens.map((item: any) => ({
      item: {
        codigo: item.produto?.sku || item.produtoId || 'GERAL',
        descricao: item.produto?.nome || item.nome || 'Produto Loja',
        quantidade: Number(item.quantidade || 1),
        valorUnitario: Number(item.precoUnitario || item.preco || 0),
        // Se houver controle de tamanho, repassa para o Tiny se necessário
        observacoes: item.tamanho ? `Tamanho: ${item.tamanho}` : undefined
      }
    }))

    // Estrutura de dados exigida pela API do Tiny para inclusão de pedidos
    const payloadTiny = {
      pedido: {
        cliente: {
          nome: cliente?.nome || 'Cliente do Site',
          email: cliente?.email || '',
          fone: cliente?.telefone || '',
          cpfCNPJ: cliente?.cpf || ''
        },
        formaPagamento: 'Site / Cartão / Pix',
        itens: itensFormatados,
        observacoes: `Pedido gerado automaticamente pelo site - ID: ${pedido.id}`
      }
    }

    // Endpoint oficial da API V3 do Tiny para pedidos
    const response = await fetch('https://api.tiny.com.br/public-api/v3/pedidos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TINY_TOKEN}`
      },
      body: JSON.stringify(payloadTiny)
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('❌ Erro retornado pela API do Tiny:', data)
    } else {
      console.log('✅ [TINY ERP] Pedido integrado e estoque baixado com sucesso no Tiny!', data)
    }
  } catch (err) {
    console.error('❌ Erro de conexão ao enviar pedido para o Tiny:', err)
  }
}

// ==========================================
// MÉTODO PUT: Atualizar status, notificar e integrar
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

    // Atualiza o pedido no banco do site
    const pedidoAtualizado = await db.pedido.update({
      where: { id },
      data: { status },
      include: {
        cliente: true,
        itens: {
          include: {
            produto: true,
          },
        },
      },
    })

    // Se o status for PAGO: Executa todas as automações
    if (status.toUpperCase() === 'PAGO') {
      const cliente = (pedidoAtualizado as any).cliente
      const primeiroNome = cliente?.nome ? cliente.nome.split(' ')[0] : 'Cliente'
      const idCurto = pedidoAtualizado.id.slice(0, 6)

      // 1. Enviar pedido para o Tiny ERP (Faz a baixa automática de estoque físico/virtual)
      await enviarPedidoParaTiny(pedidoAtualizado)

      // 2. Enviar E-mail de confirmação para o Cliente
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
          console.log(`✅ [E-MAIL CLIENTE ENVIADO] Para: ${cliente.email}`)
        } catch (emailErr: any) {
          console.error('❌ Erro ao enviar e-mail para o cliente:', emailErr)
        }
      }

      // 3. Montar a lista de itens para o e-mail interno da loja
      let itensHtml = ''
      const itensPedido = (pedidoAtualizado as any).itens || []
      
      for (const item of itensPedido) {
        const nomeProduto = item.produto?.nome || item.nome || 'Produto'
        const tamanho = item.tamanho ? ` | Tamanho: <strong>${item.tamanho}</strong>` : ''
        const qtd = item.quantidade || 1
        const precoUnit = Number(item.precoUnitario || item.preco || 0).toFixed(2)

        itensHtml += `
          <li style="margin-bottom: 8px;">
            <strong>${qtd}x</strong> ${nomeProduto} ${tamanho} — R$ ${precoUnit} un.
          </li>
        `
      }

      // 4. Enviar E-mail interno para a Loja
      const emailLoja = 'contato@jkfashionkids.com.br' 
      try {
        await resend.emails.send({
          from: 'JK Fashion Kids <contato@jkfashionkids.com.br>',
          to: [emailLoja],
          subject: `🔔 NOVO PEDIDO PAGO #${idCurto} - Separar Estoque`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
              <h2 style="color: #2563eb;">Novo Pedido Aprovado! 📦</h2>
              <p>O pagamento do pedido <strong>#${idCurto}</strong> foi confirmado. O pedido já foi enviado ao Tiny ERP.</p>
              
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Cliente:</strong> ${cliente?.nome || 'Não informado'} (${cliente?.telefone || 'Sem tel'})</p>
                <p style="margin: 0;"><strong>Itens Comprados:</strong></p>
                <ul style="padding-left: 20px; margin-top: 5px;">
                  ${itensHtml}
                </ul>
              </div>

              <p style="font-size: 12px; color: #64748b;">Este é um aviso automático gerado pelo sistema integrado da sua loja.</p>
            </div>
          `,
        })
        console.log(`✅ [E-MAIL LOJA ENVIADO] Para: ${emailLoja}`)
      } catch (lojaErr: any) {
        console.error('❌ Erro ao enviar e-mail interno para a loja:', emailErr)
      }
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Status atualizado, estoque integrado ao Tiny e notificações processadas!',
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
// MÉTODO DELETE: Excluir venda e devolver estoque local
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
