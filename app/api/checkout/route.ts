import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // =========================================================
    // 1. LER BODY
    // =========================================================

    const rawRequestBody = await req.text();

    if (!rawRequestBody) {
      return NextResponse.json(
        {
          error: "O corpo da requisição está vazio.",
        },
        {
          status: 400,
        }
      );
    }

    const body = JSON.parse(rawRequestBody);

    const {
      orderId,
      items,
      customer,
      entrega,
      valorFrete: valorFreteRaiz,
    } = body;

    // =========================================================
    // 2. VALIDAR PEDIDO
    // =========================================================

    if (!orderId) {
      return NextResponse.json(
        {
          error: "ID do pedido não informado.",
        },
        {
          status: 400,
        }
      );
    }

    const itemsRecebidos = Array.isArray(items)
      ? items
      : [];

    if (itemsRecebidos.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhum produto foi informado no pedido.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================================================
    // 3. CALCULAR TOTAL
    // =========================================================

    const taxaEntrega =
      Number(
        entrega?.valorFrete ??
          valorFreteRaiz
      ) || 0;

    const subtotal =
      itemsRecebidos.reduce(
        (
          acc: number,
          item: any
        ) => {
          const preco =
            Number(item.preco) || 0;

          const quantidade =
            Number(item.quantidade) || 0;

          return (
            acc +
            preco * quantidade
          );
        },
        0
      );

    const totalPedido =
      subtotal + taxaEntrega;

    // =========================================================
    // 4. CLIENTE
    // =========================================================

    const emailCliente =
      customer?.email ||
      `convidado_${Date.now()}@loja.com`;

    const cliente =
      await prisma.cliente.upsert({
        where: {
          email: emailCliente,
        },

        update: {
          nome:
            customer?.nome ||
            undefined,

          telefone:
            customer?.telefone ||
            undefined,
        },

        create: {
          nome:
            customer?.nome ||
            "Cliente Sem Nome",

          email:
            emailCliente,

          senha: "",

          telefone:
            customer?.telefone ||
            null,
        },
      });

    // =========================================================
    // 5. CRIAR PEDIDO PENDENTE
    // =========================================================

    const pedidoCriado =
      await prisma.pedido.create({
        data: {
          id: String(orderId),

          clienteId:
            cliente.id,

          total:
            totalPedido,

          status:
            StatusPedido.PENDENTE,

          metodoPagamento:
            "INFINITEPAY",

          itens: {
            create:
              itemsRecebidos.map(
                (item: any) => ({
                  produtoId:
                    String(
                      item.produtoId
                    ),

                  quantidade:
                    Number(
                      item.quantidade
                    ) || 1,

                  precoUnitario:
                    Number(
                      item.preco
                    ) || 0,

                  tamanho:
                    item.tamanho ||
                    "Único",

                  cor:
                    item.cor ||
                    null,
                })
              ),
          },
        },
      });

    // =========================================================
    // 6. ITENS DA INFINITEPAY
    // =========================================================

    const itemsFormatados =
      itemsRecebidos.map(
        (item: any) => {
          const partesDescricao = [
            item.nome ||
              "Produto",
          ];

          if (item.tamanho) {
            partesDescricao.push(
              `Tam: ${item.tamanho}`
            );
          }

          if (item.cor) {
            partesDescricao.push(
              `Cor: ${item.cor}`
            );
          }

          return {
            quantity:
              Number(
                item.quantidade
              ) || 1,

            price:
              Math.round(
                (Number(
                  item.preco
                ) || 0) * 100
              ),

            description:
              partesDescricao.join(
                " - "
              ),
          };
        }
      );

    // =========================================================
    // 7. FRETE
    // =========================================================

    if (
      entrega?.tipo ===
        "entrega" &&
      taxaEntrega > 0
    ) {
      itemsFormatados.push({
        quantity: 1,

        price:
          Math.round(
            taxaEntrega * 100
          ),

        description:
          "Taxa de Entrega / Frete",
      } as (typeof itemsFormatados)[number]);
    }

    // =========================================================
    // 8. TELEFONE
    // =========================================================

    const rawPhone =
      String(
        customer?.telefone ||
          ""
      ).replace(/\D/g, "");

    let formattedPhone =
      "";

    if (
      rawPhone.length >=
      10
    ) {
      formattedPhone =
        rawPhone.startsWith(
          "55"
        )
          ? `+${rawPhone}`
          : `+55${rawPhone}`;
    }

    // =========================================================
    // 9. ENDEREÇO
    // =========================================================

    const end =
      entrega?.endereco ||
      {};

    const rawCep =
      String(
        end.cep || ""
      ).replace(/\D/g, "");

    const addressFormatted =
      rawCep.length === 8
        ? {
            cep: rawCep,

            street:
              String(
                end.rua || ""
              ),

            number:
              String(
                end.numero ||
                  "SN"
              ),

            neighborhood:
              String(
                end.bairro || ""
              ),

            city:
              String(
                end.cidade || ""
              ),

            state:
              String(
                end.estado || ""
              ).toUpperCase(),

            complement:
              String(
                end.complemento ||
                  ""
              ),
          }
        : undefined;

    // =========================================================
    // 10. URL DO SITE / REDIRECIONAMENTO
    // =========================================================
    //
    // Usa a URL pública do SITE.
    //
    // Exemplo:
    // NEXT_PUBLIC_SITE_URL=
    // https://www.jkfashionkids.com.br
    //
    // Resultado:
    // https://www.jkfashionkids.com.br/
    // pedido/sucesso?orderId=PEDIDO_123
    //
    // O código remove barras finais para evitar:
    // https://site.com//pedido/sucesso
    // =========================================================

    const baseUrl = (
      process.env
        .NEXT_PUBLIC_SITE_URL ||
      process.env.SITE ||
      "https://www.jkfashionkids.com.br"
    ).replace(/\/+$/, "");

    const redirectUrl =
      `${baseUrl}/pedido/sucesso` +
      `?orderId=${encodeURIComponent(
        String(
          pedidoCriado.id
        )
      )}`;

    // =========================================================
    // 11. PAYLOAD INFINITEPAY
    // =========================================================

    const payload = {
      handle:
        process.env
          .INFINITEPAY_HANDLE,

      order_nsu:
        String(
          pedidoCriado.id
        ),

      items:
        itemsFormatados,

      redirect_url:
        redirectUrl,

      customer: {
        name:
          customer?.nome ||
          "Cliente",

        email:
          emailCliente,

        phone_number:
          formattedPhone,

        address:
          addressFormatted,
      },

      address:
        addressFormatted,
    };

    // =========================================================
    // 12. CRIAR CHECKOUT
    // =========================================================

    const response =
      await fetch(
        "https://api.checkout.infinitepay.io/links",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            payload
          ),
        }
      );

    // =========================================================
    // 13. RESPOSTA
    // =========================================================

    const rawResponse =
      await response.text();

    let data: any = {};

    try {
      data =
        rawResponse
          ? JSON.parse(
              rawResponse
            )
          : {};
    } catch {
      console.error(
        "Resposta inválida da InfinitePay:",
        rawResponse
      );

      return NextResponse.json(
        {
          error:
            "A InfinitePay retornou uma resposta inválida.",

          details:
            rawResponse.slice(
              0,
              500
            ),
        },
        {
          status: 502,
        }
      );
    }

    // =========================================================
    // 14. ERRO DA INFINITEPAY
    // =========================================================

    if (!response.ok) {
      console.error(
        "Erro retornado pela InfinitePay:",
        {
          status:
            response.status,

          data,

          order_nsu:
            payload.order_nsu,

          redirect_url:
            payload.redirect_url,

          items:
            payload.items,
        }
      );

      return NextResponse.json(
        {
          error:
            data?.message ||
            data?.error ||
            "Erro ao gerar link de pagamento na InfinitePay.",
        },
        {
          status:
            response.status,
        }
      );
    }

    // =========================================================
    // 15. URL DO CHECKOUT
    // =========================================================

    const checkoutUrl =
      data?.url ||
      data?.checkout_url;

    if (!checkoutUrl) {
      console.error(
        "A InfinitePay não retornou a URL do checkout:",
        data
      );

      return NextResponse.json(
        {
          error:
            "A InfinitePay não retornou a URL do checkout.",
        },
        {
          status: 502,
        }
      );
    }

    // =========================================================
    // 16. RETORNO PARA O FRONTEND
    // =========================================================

    return NextResponse.json({
      checkoutUrl,
    });
  } catch (error: any) {
    console.error(
      "🔥 Erro no checkout:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Falha ao criar o pedido.",
      },
      {
        status: 500,
      }
    );
  }
}
