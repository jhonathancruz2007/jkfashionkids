import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "ID do pedido não fornecido" },
      { status: 400 }
    );
  }

  try {
    const pedido = await prisma.pedido.findUnique({
      where: {
        id: String(id),
      },
      include: {
        itens: true,
      },
    });

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido não encontrado" },
        { status: 404 }
      );
    }

    // =========================================================
    // EXPIRAÇÃO DO PIX
    // =========================================================

    if (
      pedido.status === StatusPedido.PENDENTE &&
      pedido.metodoPagamento === "pix"
    ) {
      const dataCriacao = new Date(
        pedido.createdAt
      );

      const tempoExpiracao = new Date(
        dataCriacao.getTime() +
          5 * 60 * 1000
      );

      const agora = new Date();

      if (agora > tempoExpiracao) {
        await prisma.$transaction(
          async (tx) => {
            const pedidoAtual = await tx.pedido.findUnique({
              where: { id: String(id) },
              include: {
                itens: true,
              },
            });

            if (!pedidoAtual) {
              throw new Error(
                "Pedido não encontrado durante o estorno."
              );
            }

            if (
              pedidoAtual.status !==
              StatusPedido.PENDENTE
            ) {
              return;
            }

            for (const item of pedidoAtual.itens) {
              const produto =
                await tx.produto.findUnique({
                  where: {
                    id: item.produtoId,
                  },
                });

              if (!produto) continue;

              const estoqueAtual = Number(
                produto.estoque || 0
              );

              const quantidade = Number(
                item.quantidade || 0
              );

              const estoquePorTamanho =
                produto.estoquePorTamanho &&
                typeof produto.estoquePorTamanho === "object" &&
                !Array.isArray(
                  produto.estoquePorTamanho
                )
                  ? {
                      ...(produto.estoquePorTamanho as Record<
                        string,
                        number
                      >),
                    }
                  : {};

              const tamanho =
                item.tamanho?.trim() || "";

              let novoEstoquePorTamanho =
                estoquePorTamanho;

              if (
                tamanho &&
                Object.prototype.hasOwnProperty.call(
                  novoEstoquePorTamanho,
                  tamanho
                )
              ) {
                novoEstoquePorTamanho[tamanho] =
                  Number(
                    novoEstoquePorTamanho[
                      tamanho
                    ] || 0
                  ) + quantidade;
              }

              const novoEstoque =
                estoqueAtual + quantidade;

              await tx.produto.update({
                where: {
                  id: item.produtoId,
                },
                data: {
                  estoque: novoEstoque,
                  ...(Object.keys(
                    novoEstoquePorTamanho
                  ).length > 0
                    ? {
                        estoquePorTamanho:
                          novoEstoquePorTamanho,
                      }
                    : {}),
                },
              });
            }

            await tx.pedido.update({
              where: {
                id: String(id),
              },
              data: {
                status: StatusPedido.CANCELADO,
              },
            });
          }
        );

        return NextResponse.json({
          status: StatusPedido.CANCELADO,
        });
      }
    }

    return NextResponse.json({
      status: pedido.status,
    });
  } catch (error: any) {
    console.error(
      "Erro ao consultar status do pedido:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao consultar status",
      },
      { status: 500 }
    );
  }
}
