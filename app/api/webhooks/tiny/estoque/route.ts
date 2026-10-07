import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    
    if (!bodyText) {
      return NextResponse.json({ error: "Corpo vazio." }, { status: 400 });
    }

    // O Tiny pode enviar os dados via form-urlencoded ou JSON
    let payload: any = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      const params = new URLSearchParams(bodyText);
      const dadosStr = params.get("dados") || params.get("estoque");
      if (dadosStr) {
        payload = JSON.parse(dadosStr);
      }
    }

    // Extrai as informações do produto enviado pelo webhook do Tiny
    const idProdutoTiny = payload.id || payload.idProduto || payload.produto?.id;
    const novoSaldo = payload.saldo !== undefined ? Number(payload.saldo) : Number(payload.estoque);

    if (!idProdutoTiny || isNaN(novoSaldo)) {
      return NextResponse.json({ error: "Dados de produto ou saldo não encontrados no payload." }, { status: 400 });
    }

    // Atualiza o estoque local no Prisma imediatamente
    const produtoAtualizado = await prisma.produto.update({
      where: { id: String(idProdutoTiny) },
      data: {
        estoque: Math.max(0, novoSaldo),
      },
    });

    console.log(`[Webhook Tiny] Estoque do produto ${produtoAtualizado.nome} (ID: ${idProdutoTiny}) atualizado para ${novoSaldo}`);

    return NextResponse.json({ success: true, message: "Estoque sincronizado em tempo real com sucesso!" });
  } catch (error: any) {
    console.error("[Webhook Tiny Error]:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar webhook de estoque.", details: error.message },
      { status: 500 }
    );
  }
}
