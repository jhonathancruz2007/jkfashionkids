import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";

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
    const { orderId, items, customer, entrega, valorFrete: valorFreteRaiz } = body;

    const taxaEntrega = Number(entrega?.valorFrete ?? valorFreteRaiz) || 0;
    const subtotal = (items || []).reduce(
      (acc: number, item: any) => acc + Number(item.preco) * Number(item.quantidade),
      0
    );
    const totalPedido = subtotal + taxaEntrega;

    const emailCliente = customer?.email || `convidado_${Date.now()}@loja.com`;

    // A. Busca ou cria o cliente para satisfazer o clienteId obrigatório
    const cliente = await prisma.cliente.upsert({
      where: { email: emailCliente },
      update: {
        nome: customer?.nome || undefined,
        telefone: customer?.telefone || undefined,
      },
      create: {
        nome: customer?.nome || "Cliente Sem Nome",
        email: emailCliente,
        senha: "", // Senha vazia para compras sem login prévio
        telefone: customer?.telefone || null,
      },
    });

    // B. Salva o pedido inicial como PENDENTE no banco de dados
    const pedidoCriado = await prisma.pedido.create({
      data: {
        id: orderId,
        clienteId: cliente.id,
        total: totalPedido,
        status: StatusPedido.PENDENTE,
        metodoPagamento: "INFINITEPAY",
        itens: {
          create: (items || []).map((item: any) => ({
            produtoId: String(item.produtoId),
            quantidade: Number(item.quantidade),
            precoUnitario: Number(item.preco),
            tamanho: item.tamanho || "Único",
          })),
        },
      },
    });

    // C. Mapeia os itens para o checkout da InfinitePay
    const itemsFormatados = (items || []).map((item: any) => ({
      quantity: Number(item.quantidade) || 1,
      price: Math.round((Number(item.preco) || 0) * 100),
      description: String(
        item.tamanho ? `${item.nome || "Produto"} (Tam: ${item.tamanho})` : item.nome || "Produto"
      ),
    }));

    if (entrega?.tipo === "entrega" && taxaEntrega > 0) {
      itemsFormatados.push({
        quantity: 1,
        price: Math.round(taxaEntrega * 100),
        description: "Taxa de Entrega / Frete",
      });
    }

    const rawPhone = String(customer?.telefone || "").replace(/\D/g, "");
    let formattedPhone = "";
    if (rawPhone.length >= 10) {
      formattedPhone = rawPhone.startsWith("55") ? `+${rawPhone}` : `+55${rawPhone}`;
    }

    const end = entrega?.endereco || {};
    const rawCep = String(end.cep || "").replace(/\D/g, "");

    const addressFormatted = rawCep.length === 8 ? {
      cep: rawCep,
      street: String(end.rua || ""),
      number: String(end.numero || "SN"),
      neighborhood: String(end.bairro || ""),
      city: String(end.cidade || ""),
      state: String(end.estado || "").toUpperCase(),
      complement: String(end.complemento || ""),
    } : undefined;

    const payload = {
      handle: process.env.INFINITEPAY_HANDLE,
      order_nsu: String(pedidoCriado.id),
      items: itemsFormatados,
      redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/pedido/sucesso?orderId=${pedidoCriado.id}`,
      customer: {
        name: customer?.nome || "Cliente",
        email: emailCliente,
        phone_number: formattedPhone,
        address: addressFormatted,
      },
      address: addressFormatted,
    };

    const response = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || "Erro ao gerar link de pagamento." },
        { status: response.status }
      );
    }

    return NextResponse.json({
      checkoutUrl: data.url || data.checkout_url,
    });
  } catch (error: any) {
    console.error("Erro no checkout:", error);
    return NextResponse.json(
      { error: error?.message || "Falha ao criar o pedido." },
      { status: 500 }
    );
  }
}