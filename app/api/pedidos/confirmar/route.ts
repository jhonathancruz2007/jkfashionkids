import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { error: "ID do pedido não informado." },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id: orderId },
      include: { itens: true },
    });

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    // Evita dar baixa duplicada caso o usuário recarregue a página de sucesso
    if (pedido.status === StatusPedido.PAGO) {
      return NextResponse.json({
        message: "Pedido já foi confirmado previamente.",
      });
    }

    // Transação para alterar status para PAGO e descontar estoque localmente
    await prisma.$transaction(async (tx) => {
      // 1. Atualiza a situação do pedido
      await tx.pedido.update({
        where: { id: orderId },
        data: {
          status: StatusPedido.PAGO,
        },
      });

      // 2. Abate do estoque geral e do estoque por tamanho de cada item
      for (const item of pedido.itens) {
        const produto = await tx.produto.findUnique({
          where: { id: item.produtoId },
        });

        if (produto) {
          const novoEstoqueGeral = Math.max(0, produto.estoque - item.quantidade);
          let novoEstoquePorTamanho =
            (produto.estoquePorTamanho as Record<string, number>) || {};

          if (item.tamanho && novoEstoquePorTamanho[item.tamanho] !== undefined) {
            novoEstoquePorTamanho[item.tamanho] = Math.max(
              0,
              novoEstoquePorTamanho[item.tamanho] - item.quantidade
            );
          }

          await tx.produto.update({
            where: { id: item.produtoId },
            data: {
              estoque: novoEstoqueGeral,
              estoquePorTamanho: novoEstoquePorTamanho,
            },
          });
        }
      }
    });

    // 3. Envia a baixa de estoque para o Tiny ERP de forma síncrona/assíncrona após o pagamento confirmado
    const TINY_TOKEN = process.env.TINY_API_TOKEN;
    if (TINY_TOKEN) {
      for (const item of pedido.itens) {
        try {
          const urlBaixaTiny = `https://api.tiny.com.br/api2/estoque.atualizar.php`;
          const params = new URLSearchParams({
            token: TINY_TOKEN.trim(),
            formato: "json",
            idProduto: String(item.produtoId),
            tipo: "B", // 'B' para Baixa / Saída de estoque
            quantidade: String(item.quantidade),
          });

          await fetch(urlBaixaTiny, {
            method: "POST",
            body: params,
          });
        } catch (errTiny) {
          console.error(`Erro ao enviar baixa para o Tiny (Produto ID: ${item.produtoId}):`, errTiny);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Estoque abatido no site e no Tiny, e pedido confirmado com sucesso!",
    });
  } catch (error: any) {
    console.error("Erro ao confirmar o pedido:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a confirmação do pedido." },
      { status: 500 }
    );
  }
}
