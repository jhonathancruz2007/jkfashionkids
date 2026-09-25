import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const rawRequestBody = await req.text();

    if (!rawRequestBody) {
      return NextResponse.json(
        { error: "O corpo da requisição está vazio." },
        { status: 400 }
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

    const itemsRecebidos = Array.isArray(items) ? items : [];

    if (itemsRecebidos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum produto foi informado no pedido." },
        { status: 400 }
      );
    }

    const taxaEntrega = Number(
      entrega?.valorFrete ?? valorFreteRaiz
    ) || 0;

    const subtotal = itemsRecebidos.reduce(
      (acc: number, item: any) =>
        acc +
        (Number(item.preco) || 0) *
        (Number(item.quantidade) || 0),
      0
    );

    const totalPedido = subtotal + taxaEntrega;

    const emailCliente =
      customer?.email || `convidado_${Date.now()}@loja.com`;

    // =========================================================
    // A. BUSCA/CRIA O CLIENTE
    // =========================================================

    const cliente = await prisma.cliente.upsert({
      where: { email: emailCliente },
      update: {
        nome: customer?.nome || undefined,
        telefone: customer?.telefone || undefined,
      },
      create: {
        nome: customer?.nome || "Cliente Sem Nome",
        email: emailCliente,
        senha: "",
        telefone: customer?.telefone || null,
      },
    });

    // =========================================================
    // C. SALVA O PEDIDO INICIAL COMO PENDENTE
    // =========================================================

    const pedidoCriado = await prisma.pedido.create({
      data: {
        id: orderId,
        clienteId: cliente.id,
        total: totalPedido,
        status: StatusPedido.PENDENTE,
        metodoPagamento: "INFINITEPAY",
        itens: {
          create: itemsRecebidos.map((item: any) => ({
            produtoId: String(item.produtoId),
            quantidade: Number(item.quantidade) || 1,
            precoUnitario: Number(item.preco) || 0,
            tamanho: item.tamanho || "Único",
            cor: item.cor || null,
          })),
        },
      },
    });

    // =========================================================
    // D. MONTA OS ITENS PARA A INFINITEPAY
    // =========================================================
    // A API documentada do Checkout aceita, em cada item,
    // quantity, price e description.
    // Não enviamos image_url porque esse campo não faz parte
    // do payload documentado e estava causando erro na criação
    // do checkout.

    const itemsFormatados = itemsRecebidos.map((item: any) => {
      const partesDescricao = [item.nome || "Produto"];

      if (item.tamanho) {
        partesDescricao.push(`Tam: ${item.tamanho}`);
      }

      if (item.cor) {
        partesDescricao.push(`Cor: ${item.cor}`);
      }

      return {
        quantity: Number(item.quantidade) || 1,
        price: Math.round((Number(item.preco) || 0) * 100),
        description: partesDescricao.join(" - "),
      };
    });

    if (entrega?.tipo === "entrega" && taxaEntrega > 0) {
      itemsFormatados.push({
        quantity: 1,
        price: Math.round(taxaEntrega * 100),
        description: "Taxa de Entrega / Frete",
      } as (typeof itemsFormatados)[number]);
    }

    // =========================================================
    // E. TELEFONE
    // =========================================================

    const rawPhone = String(customer?.telefone || "").replace(/\D/g, "");

    let formattedPhone = "";

    if (rawPhone.length >= 10) {
      formattedPhone = rawPhone.startsWith("55")
        ? `+${rawPhone}`
        : `+55${rawPhone}`;
    }

    // =========================================================
    // F. ENDEREÇO
    // =========================================================

    const end = entrega?.endereco || {};
    const rawCep = String(end.cep || "").replace(/\D/g, "");

    const addressFormatted =
      rawCep.length === 8
        ? {
            cep: rawCep,
            street: String(end.rua || ""),
            number: String(end.numero || "SN"),
            neighborhood: String(end.bairro || ""),
            city: String(end.cidade || ""),
            state: String(end.estado || "").toUpperCase(),
            complement: String(end.complemento || ""),
          }
        : undefined;

    // =========================================================
    // G. PAYLOAD DO CHECKOUT
    // =========================================================

    const payload = {
      handle: process.env.INFINITEPAY_HANDLE,
      order_nsu: String(pedidoCriado.id),
      items: itemsFormatados,
      redirect_url: `${
        process.env.NEXT_PUBLIC_BASE_URL || "https://www.jkfashionkids.com.br/pedido/sucesso"
      }/pedido/sucesso?orderId=${pedidoCriado.id}`,
      customer: {
        name: customer?.nome || "Cliente",
        email: emailCliente,
        phone_number: formattedPhone,
        address: addressFormatted,
      },
      address: addressFormatted,
    };

    // =========================================================
    // H. CRIA O LINK NA INFINITEPAY
    // =========================================================

    const response = await fetch(
      "https://api.checkout.infinitepay.io/links",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const rawResponse = await response.text();

    let data: any = {};

    try {
      data = rawResponse ? JSON.parse(rawResponse) : {};
    } catch {
      return NextResponse.json(
        {
          error: "A InfinitePay retornou uma resposta inválida.",
          details: rawResponse.slice(0, 500),
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      console.error("Erro retornado pela InfinitePay:", {
        status: response.status,
        data,
        payloadSemDadosSensíveis: {
          order_nsu: payload.order_nsu,
          items: payload.items,
        },
      });

      return NextResponse.json(
        {
          error:
            data.message ||
            data.error ||
            "Erro ao gerar link de pagamento.",
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      checkoutUrl: data.url || data.checkout_url,
    });
  } catch (error: any) {
    console.error("Erro no checkout:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Falha ao criar o pedido.",
      },
      { status: 500 }
    );
  }
}
