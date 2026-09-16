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
          'Site / Cartão / Pix',

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
      // 2. E-MAIL DE CONFIRMAÇÃO PARA O CLIENTE
      // ===================================================
      if (cliente?.email) {
        try {
          await resend.emails.send({
            from:
              'JK Fashion Kids <contato@jkfashionkids.com.br>',

            to: [
              cliente.email,
            ],

            subject:
              `Pagamento Aprovado! Pedido #${idCurto}`,

            html: `
              <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
                <h2>Olá, ${primeiroNome}! 🎉</h2>

                <p>
                  Recebemos a confirmação do pagamento
                  do seu pedido
                  <strong>#${idCurto}</strong>.
                </p>

                <p>
                  Já estamos separando e preparando
                  tudo com muito carinho para envio!
                </p>

                <hr
                  style="
                    border: none;
                    border-top: 1px solid #eee;
                    margin: 20px 0;
                  "
                />

                <p>
                  Obrigado por comprar conosco na
                  <strong>JK Fashion Kids</strong>!
                </p>
              </div>
            `,
          })

          console.log(
            `✅ [E-MAIL CLIENTE ENVIADO] Para: ${cliente.email}`
          )
        } catch (emailErr: any) {
          console.error(
            '❌ Erro ao enviar e-mail para o cliente:',
            emailErr
          )
        }
      }

      // ===================================================
      // 3. MONTA ITENS PARA E-MAIL INTERNO
      // ===================================================
      let itensHtml = ''

      const itensPedido =
        (pedidoAtualizado as any).itens || []

      for (const item of itensPedido) {
        const nomeProduto =
          item.produto?.nome ||
          item.nome ||
          'Produto'

        const tamanho =
          item.tamanho
            ? ` | Tamanho: <strong>${item.tamanho}</strong>`
            : ''

        const cor =
          item.cor
            ? ` | Cor: <strong>${item.cor}</strong>`
            : ''

        const qtd =
          Number(item.quantidade || 1)

        const precoUnit =
          Number(
            item.precoUnitario ||
              item.preco ||
              0
          ).toFixed(2)

        itensHtml += `
          <li style="margin-bottom: 8px;">
            <strong>${qtd}x</strong>
            ${nomeProduto}
            ${tamanho}
            ${cor}
            —
            R$ ${precoUnit} un.
          </li>
        `
      }

      // ===================================================
      // 4. E-MAIL INTERNO DA LOJA
      // ===================================================
      const emailLoja =
        'contato@jkfashionkids.com.br'

      try {
        await resend.emails.send({
          from:
            'JK Fashion Kids <contato@jkfashionkids.com.br>',

          to: [
            emailLoja,
          ],

          subject:
            `🔔 NOVO PEDIDO PAGO #${idCurto} - Separar Estoque`,

          html: `
            <div
              style="
                font-family: Arial, sans-serif;
                color: #333;
                padding: 20px;
              "
            >
              <h2 style="color: #2563eb;">
                Novo Pedido Aprovado! 📦
              </h2>

              <p>
                O pagamento do pedido
                <strong>#${idCurto}</strong>
                foi confirmado.
              </p>

              <p>
                A integração do pedido com o Tiny
                foi processada.
              </p>

              <div
                style="
                  background-color: #f8fafc;
                  padding: 15px;
                  border-radius: 6px;
                  margin: 15px 0;
                "
              >
                <p style="margin: 0 0 10px 0;">
                  <strong>Cliente:</strong>
                  ${cliente?.nome || 'Não informado'}
                  (${cliente?.telefone || 'Sem tel'})
                </p>

                <p style="margin: 0;">
                  <strong>Itens Comprados:</strong>
                </p>

                <ul
                  style="
                    padding-left: 20px;
                    margin-top: 5px;
                  "
                >
                  ${itensHtml}
                </ul>
              </div>

              <p
                style="
                  font-size: 12px;
                  color: #64748b;
                "
              >
                Este é um aviso automático
                gerado pelo sistema integrado
                da sua loja.
              </p>
            </div>
          `,
        })

        console.log(
          `✅ [E-MAIL LOJA ENVIADO] Para: ${emailLoja}`
        )
      } catch (lojaErr: any) {
        // CORRIGIDO:
        // antes estava usando "emailErr",
        // que não existe neste escopo.
        console.error(
          '❌ Erro ao enviar e-mail interno para a loja:',
          lojaErr
        )
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
