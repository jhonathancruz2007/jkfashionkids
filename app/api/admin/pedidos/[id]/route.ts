import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const TINY_TOKEN = process.env.TINY_API_TOKEN

// =========================================================
// Integra o pedido no Tiny.
// IMPORTANTE:
// Esta função NÃO faz baixa de estoque.
// A baixa do estoque acontece exclusivamente em
// /api/pedidos/confirmar, para evitar duplicidade.
// =========================================================
async function enviarPedidoParaTiny(pedido: any) {
  if (!TINY_TOKEN) {
    console.warn(
      '⚠️ Token do Tiny não configurado nas variáveis de ambiente.'
    )
    return {
      sucesso: false,
      erro: 'TINY_API_TOKEN não configurado.',
    }
  }

  try {
    const cliente = pedido.cliente

    const itensFormatados = (pedido.itens || []).map((item: any) => ({
      item: {
        // O código atual continua sendo mantido para não quebrar
        // a integração que você já possui.
        codigo: item.produto?.sku || item.produtoId || 'GERAL',

        descricao:
          item.produto?.nome ||
          item.nome ||
          'Produto Loja',

        quantidade: Number(item.quantidade || 1),

        valorUnitario: Number(
          item.precoUnitario ||
            item.preco ||
            0
        ),

        observacoes: [
          item.tamanho
            ? `Tamanho: ${item.tamanho}`
            : null,

          item.cor
            ? `Cor: ${item.cor}`
            : null,
        ]
          .filter(Boolean)
          .join(' | ') || undefined,
      },
    }))

    const payloadTiny = {
      pedido: {
        cliente: {
          nome:
            cliente?.nome ||
            'Cliente do Site',

          email:
            cliente?.email ||
            '',

          fone:
            cliente?.telefone ||
            '',

          cpfCNPJ:
            cliente?.cpf ||
            '',
        },

        formaPagamento:
          pedido.metodoPagamento ||
          'Não informado',

        itens: itensFormatados,

        observacoes:
          `Pedido gerado automaticamente pelo site - ID: ${pedido.id}`,
      },
    }

    const response = await fetch(
      'https://api.tiny.com.br/public-api/v3/pedidos',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TINY_TOKEN}`,
        },

        body: JSON.stringify(payloadTiny),
      }
    )

    const texto = await response.text()

    let data: any

    try {
      data = texto ? JSON.parse(texto) : null
    } catch {
      data = texto
    }

    if (!response.ok) {
      console.error(
        '❌ Erro retornado pela API do Tiny:',
        data
      )

      return {
        sucesso: false,
        erro:
          typeof data === 'string'
            ? data
            : JSON.stringify(data),
        resposta: data,
      }
    }

    console.log(
      '✅ [TINY ERP] Pedido integrado com sucesso.',
      data
    )

    return {
      sucesso: true,
      resposta: data,
    }
  } catch (err: any) {
    console.error(
      '❌ Erro de conexão ao enviar pedido para o Tiny:',
      err
    )

    return {
      sucesso: false,
      erro:
        err?.message ||
        'Erro de conexão com o Tiny.',
    }
  }
}

// =========================================================
// MÉTODO PUT
// Atualiza o status do pedido
// =========================================================
export async function PUT(
  request: Request,
  {
    params,
  }: {
    params:
      | Promise<{ id: string }>
      | { id: string }
  }
) {
  try {
    const resolvedParams = await params

    const id = resolvedParams.id

    const body = await request.json()

    const statusRecebido = String(
      body?.status || ''
    )
      .trim()
      .toUpperCase()

    if (!id || !statusRecebido) {
      return NextResponse.json(
        {
          error:
            'ID ou status não informados.',
        },
        { status: 400 }
      )
    }

    // -----------------------------------------------------
    // Busca o pedido atual antes da alteração.
    // Isso nos permite identificar uma transição real para PAGO.
    // -----------------------------------------------------
    const pedidoAntes = await db.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
      },
    })

    if (!pedidoAntes) {
      return NextResponse.json(
        {
          error: 'Pedido não encontrado.',
        },
        { status: 404 }
      )
    }

    const jaEstavaPago =
      String(pedidoAntes.status).toUpperCase() ===
      'PAGO'

    // -----------------------------------------------------
    // Atualiza somente o status.
    // -----------------------------------------------------
    const pedidoAtualizado = await db.pedido.update({
      where: { id },

      data: {
        status: statusRecebido as any,
      },

      include: {
        cliente: true,

        itens: {
          include: {
            produto: true,
          },
        },
      },
    })

    // =====================================================
    // SOMENTE quando ocorreu uma entrada real em PAGO
    // =====================================================
    const entrouEmPago =
      statusRecebido === 'PAGO' &&
      !jaEstavaPago

    let integracaoTiny: any = {
      processada: false,
    }

    if (entrouEmPago) {
      const cliente =
        (pedidoAtualizado as any).cliente

      const primeiroNome =
        cliente?.nome
          ? cliente.nome.split(' ')[0]
          : 'Cliente'

      const idCurto =
        pedidoAtualizado.id.slice(0, 6)

      // ===================================================
      // 1. INTEGRA PEDIDO NO TINY
      //
      // A baixa de estoque NÃO acontece aqui.
      // Ela é feita na rota /api/pedidos/confirmar.
      // ===================================================
      integracaoTiny =
        await enviarPedidoParaTiny(
          pedidoAtualizado
        )

      // ===================================================
      // 2. E-MAILS DE CONFIRMAÇÃO
      //
      // O fluxo principal de pagamento usa /api/pedidos/confirmar.
      // Este PUT continua enviando os e-mails quando o admin muda
      // manualmente o pedido para PAGO pela primeira vez.
      // ===================================================

      const clienteSeguro = (pedidoAtualizado as any).cliente || null
      const itensPedido = (pedidoAtualizado as any).itens || []
      const totalPedido = Number((pedidoAtualizado as any).total || 0)
      const metodoPagamento =
        String((pedidoAtualizado as any).metodoPagamento || 'Não informado').trim() ||
        'Não informado'

      const escaparHtml = (valor: any) =>
        String(valor ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')

      const formatarMoeda = (valor: any) =>
        Number(valor || 0).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })

      const endereco = [
        clienteSeguro?.rua,
        clienteSeguro?.numero ? `nº ${clienteSeguro.numero}` : null,
        clienteSeguro?.complemento,
        clienteSeguro?.bairro,
        clienteSeguro?.cidade,
        clienteSeguro?.estado,
        clienteSeguro?.cep ? `CEP ${clienteSeguro.cep}` : null,
      ]
        .filter((item: any) => String(item ?? '').trim())
        .join(', ') || 'Não informado'

      let itensHtml = ''

      for (const item of itensPedido) {
        const nomeProduto = escaparHtml(
          item?.produto?.nome || item?.nome || 'Produto'
        )

        const tamanho = item?.tamanho
          ? ` · Tamanho: <strong>${escaparHtml(item.tamanho)}</strong>`
          : ''

        const cor = item?.cor
          ? ` · Cor: <strong>${escaparHtml(item.cor)}</strong>`
          : ''

        const qtd = Number(item?.quantidade || 1)
        const precoUnit = Number(item?.precoUnitario || 0)
        const subtotal = qtd * precoUnit

        itensHtml += `
          <tr>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
              <strong>${qtd}x ${nomeProduto}</strong><br/>
              <span style="font-size:12px;color:#64748b;">${tamanho}${cor}</span>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
              ${formatarMoeda(precoUnit)} / un.<br/>
              <strong>${formatarMoeda(subtotal)}</strong>
            </td>
          </tr>
        `
      }

      if (clienteSeguro?.email) {
        try {
          await resend.emails.send({
            from: 'JK Fashion Kids <contato@jkfashionkids.com.br>',
            to: [clienteSeguro.email],
            subject: `Pagamento confirmado! Pedido #${idCurto}`,
            html: `
              <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;">
                <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
                  <h1 style="margin:0 0 8px;font-size:24px;">Olá, ${escaparHtml(String(clienteSeguro.nome || 'Cliente').split(/\s+/)[0])}! 🎉</h1>
                  <p>Seu pagamento foi confirmado para o pedido <strong>#${escaparHtml(idCurto)}</strong>.</p>
                  <h2 style="font-size:16px;">Resumo da compra</h2>
                  <table style="width:100%;border-collapse:collapse;"><tbody>${itensHtml || '<tr><td>Nenhum item encontrado.</td></tr>'}</tbody></table>
                  <p><strong>Forma de pagamento:</strong> ${escaparHtml(metodoPagamento)}</p>
                  <p><strong>Total:</strong> ${formatarMoeda(totalPedido)}</p>
                  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                    <p style="margin:0 0 6px;"><strong>Endereço:</strong></p>
                    <p style="margin:0;color:#475569;line-height:1.6;">${escaparHtml(endereco)}</p>
                  </div>
                  <p style="margin-top:20px;">Obrigado por comprar com a <strong>JK Fashion Kids</strong>!</p>
                </div>
              </div>
            `,
          })

          console.log(`✅ [E-MAIL CLIENTE ENVIADO] Para: ${clienteSeguro.email}`)
        } catch (emailErr: any) {
          console.error('❌ Erro ao enviar e-mail para o cliente:', emailErr)
        }
      }

      const emailLoja = 'contato@jkfashionkids.com.br'

      try {
        await resend.emails.send({
          from: 'JK Fashion Kids <contato@jkfashionkids.com.br>',
          to: [emailLoja],
          subject: `🔔 NOVO PEDIDO PAGO #${idCurto} - Separar Estoque`,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;">
              <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
                <div style="padding:24px;background:#111827;color:#ffffff;">
                  <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.75;">JK Fashion Kids</div>
                  <h1 style="margin:6px 0 0;font-size:24px;">Novo pedido pago 📦</h1>
                </div>
                <div style="padding:24px;">
                  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                    <h2 style="margin:0 0 10px;font-size:16px;">Cliente</h2>
                    <p style="margin:6px 0;"><strong>Nome:</strong> ${escaparHtml(clienteSeguro?.nome || 'Não informado')}</p>
                    <p style="margin:6px 0;"><strong>E-mail:</strong> ${escaparHtml(clienteSeguro?.email || 'Não informado')}</p>
                    <p style="margin:6px 0;"><strong>Telefone:</strong> ${escaparHtml(clienteSeguro?.telefone || 'Não informado')}</p>
                    <p style="margin:6px 0;"><strong>Endereço:</strong> ${escaparHtml(endereco)}</p>
                  </div>

                  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                    <h2 style="margin:0 0 10px;font-size:16px;">Pagamento</h2>
                    <p style="margin:6px 0;"><strong>Status:</strong> PAGO</p>
                    <p style="margin:6px 0;"><strong>Forma de pagamento:</strong> ${escaparHtml(metodoPagamento)}</p>
                    <p style="margin:6px 0;"><strong>Total:</strong> <span style="font-size:18px;font-weight:700;">${formatarMoeda(totalPedido)}</span></p>
                  </div>

                  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                    <h2 style="margin:0 0 10px;font-size:16px;">Produtos comprados</h2>
                    <table style="width:100%;border-collapse:collapse;"><tbody>${itensHtml || '<tr><td>Nenhum item encontrado.</td></tr>'}</tbody></table>
                  </div>
                </div>
              </div>
            </div>
          `,
        })

        console.log(`✅ [E-MAIL LOJA ENVIADO] Para: ${emailLoja}`)
      } catch (lojaErr: any) {
        console.error('❌ Erro ao enviar e-mail interno para a loja:', lojaErr)
      }
    }

    // =====================================================
    // RETORNO
    // =====================================================
    return NextResponse.json({
      sucesso: true,

      mensagem:
        entrouEmPago
          ? 'Status atualizado e automações processadas com sucesso.'
          : 'Status atualizado com sucesso.',

      integracaoTiny,

      pedido: pedidoAtualizado,
    })
  } catch (erro: any) {
    console.error(
      '❌ Erro na rota PUT:',
      erro
    )

    return NextResponse.json(
      {
        error:
          erro?.message ||
          'Erro ao atualizar pedido.',
      },
      { status: 500 }
    )
  }
}

// =========================================================
// MÉTODO DELETE
// Excluir venda e devolver estoque LOCAL
// =========================================================
export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params:
      | Promise<{ id: string }>
      | { id: string }
  }
) {
  try {
    const resolvedParams = await params

    const id = resolvedParams.id

    if (!id) {
      return NextResponse.json(
        {
          error:
            'ID do pedido não informado.',
        },
        { status: 400 }
      )
    }

    await db.$transaction(
      async (tx) => {
        const pedido =
          await tx.pedido.findUnique({
            where: { id },

            include: {
              itens: true,
            },
          })

        if (!pedido) {
          throw new Error(
            'Pedido não encontrado.'
          )
        }

        // -------------------------------------------------
        // Devolve estoque local de cada item
        // -------------------------------------------------
        for (const item of pedido.itens) {
          const produtoId =
            (item as any).produtoId

          const quantidadeDevolvida =
            Number(
              item.quantidade || 1
            )

          const tamanhoEscolhido =
            item.tamanho
              ? String(item.tamanho)
                  .trim()
                  .toUpperCase()
              : null

          if (!produtoId) {
            continue
          }

          const produto =
            await tx.produto.findUnique({
              where: {
                id: produtoId,
              },
            })

          if (!produto) {
            console.warn(
              `⚠️ Produto ${produtoId} não encontrado ao excluir o pedido ${id}.`
            )

            continue
          }

          const estoqueAtualGeral =
            Number(
              produto.estoque || 0
            )

          // -----------------------------------------------
          // Estoque por tamanho
          // -----------------------------------------------
          let estoqueObj:
            Record<string, number> = {}

          const brutoTamanhos =
            produto.estoquePorTamanho

          if (
            brutoTamanhos &&
            typeof brutoTamanhos === 'object' &&
            !Array.isArray(brutoTamanhos)
          ) {
            estoqueObj = {
              ...(brutoTamanhos as Record<string, number>),
            }
          }

          let encontrouTamanho =
            false

          if (
            tamanhoEscolhido &&
            Object.keys(estoqueObj).length > 0
          ) {
            const chaveTamanho =
              Object.keys(
                estoqueObj
              ).find(
                (k) =>
                  k
                    .trim()
                    .toUpperCase() ===
                  tamanhoEscolhido
              )

            if (chaveTamanho) {
              estoqueObj[
                chaveTamanho
              ] =
                Number(
                  estoqueObj[
                    chaveTamanho
                  ] || 0
                ) +
                quantidadeDevolvida

              encontrouTamanho = true
            }
          }

          // -----------------------------------------------
          // Devolve também o estoque por COR.
          // Aceita os dois formatos usados pelo site:
          // - cor -> número
          // - cor -> { tamanho -> quantidade }
          // -----------------------------------------------
          let estoquePorCorObj: Record<string, any> = {}

          const brutoCores =
            (produto as any).estoquePorCor

          if (
            brutoCores &&
            typeof brutoCores === 'object' &&
            !Array.isArray(brutoCores)
          ) {
            estoquePorCorObj =
              JSON.parse(
                JSON.stringify(brutoCores)
              )
          }

          const corEscolhida =
            (item as any).cor
              ? String((item as any).cor)
                  .trim()
                  .toUpperCase()
              : null

          let encontrouCor = false

          if (
            corEscolhida &&
            Object.keys(estoquePorCorObj).length > 0
          ) {
            const chaveCor =
              Object.keys(
                estoquePorCorObj
              ).find(
                (k) =>
                  k
                    .trim()
                    .toUpperCase() ===
                  corEscolhida
              )

            if (chaveCor) {
              const estoqueDaCor =
                estoquePorCorObj[chaveCor]

              if (
                tamanhoEscolhido &&
                estoqueDaCor &&
                typeof estoqueDaCor === 'object' &&
                !Array.isArray(estoqueDaCor)
              ) {
                const chaveTamanhoCor =
                  Object.keys(
                    estoqueDaCor
                  ).find(
                    (k) =>
                      k
                        .trim()
                        .toUpperCase() ===
                      tamanhoEscolhido
                  )

                if (chaveTamanhoCor) {
                  estoqueDaCor[
                    chaveTamanhoCor
                  ] =
                    Number(
                      estoqueDaCor[
                        chaveTamanhoCor
                      ] || 0
                    ) +
                    quantidadeDevolvida

                  encontrouCor = true
                }
              } else if (
                typeof estoqueDaCor === 'number' ||
                typeof estoqueDaCor === 'string'
              ) {
                estoquePorCorObj[chaveCor] =
                  Number(
                    estoqueDaCor || 0
                  ) +
                  quantidadeDevolvida

                encontrouCor = true
              }
            }
          }

          const updateData: any = {}

          // -----------------------------------------------
          // Quando o produto possui estoque por tamanho,
          // o estoque geral passa a ser a soma dos tamanhos.
          // -----------------------------------------------
          if (
            encontrouTamanho
          ) {
            const novoEstoqueTotal =
              Object.values(
                estoqueObj
              ).reduce(
                (
                  total: number,
                  valor: any
                ) =>
                  total +
                  (
                    Number(
                      valor
                    ) || 0
                  ),
                0
              )

            updateData.estoque =
              novoEstoqueTotal

            updateData.estoquePorTamanho =
              estoqueObj
          } else {
            // ---------------------------------------------
            // Produto sem controle por tamanho
            // ---------------------------------------------
            updateData.estoque =
              estoqueAtualGeral +
              quantidadeDevolvida
          }

          if (encontrouCor) {
            updateData.estoquePorCor =
              estoquePorCorObj
          }

          await tx.produto.update({
            where: {
              id: produtoId,
            },

            data: updateData,
          })
        }

        // -------------------------------------------------
        // Remove itens do pedido
        // -------------------------------------------------
        await tx.itemPedido.deleteMany({
          where: {
            pedidoId: id,
          },
        })

        // -------------------------------------------------
        // Remove o pedido
        // -------------------------------------------------
        await tx.pedido.delete({
          where: {
            id,
          },
        })
      }
    )

    return NextResponse.json({
      sucesso: true,

      mensagem:
        'Venda excluída e itens devolvidos ao estoque local com sucesso!',
    })
  } catch (erro: any) {
    console.error(
      '❌ Erro ao excluir venda:',
      erro
    )

    return NextResponse.json(
      {
        error:
          erro?.message ||
          'Erro ao tentar excluir a venda.',
      },
      { status: 500 }
    )
  }
}
