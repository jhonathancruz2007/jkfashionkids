import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";

type TinyVariacao = {
  id?: string | number;
  codigo?: string;
  tamanho?: string;
  cor?: string;
};

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function obterVariacoesTiny(produto: any): TinyVariacao[] {
  const raw = produto?.tinyVariacoes;

  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.filter(Boolean) as TinyVariacao[];
  }

  if (typeof raw === "object") {
    return Object.values(raw).filter(Boolean) as TinyVariacao[];
  }

  return [];
}

function encontrarVariacaoTiny(
  produto: any,
  tamanho: string | null,
  cor: string | null
): TinyVariacao | null {
  const variacoes = obterVariacoesTiny(produto);

  if (variacoes.length === 0) {
    return null;
  }

  const tamanhoNorm = normalizar(tamanho);
  const corNorm = normalizar(cor);

  // Quando existem tamanho e cor, exige correspondência dos dois.
  if (tamanhoNorm && corNorm) {
    const encontrada = variacoes.find(
      (v) =>
        normalizar(v.tamanho) === tamanhoNorm &&
        normalizar(v.cor) === corNorm
    );

    if (encontrada?.id) {
      return encontrada;
    }
  }

  // Produto controlado somente por tamanho.
  if (tamanhoNorm) {
    const encontrada = variacoes.find(
      (v) =>
        normalizar(v.tamanho) === tamanhoNorm &&
        !normalizar(cor)
    );

    if (encontrada?.id) {
      return encontrada;
    }

    const encontradaPorTamanho = variacoes.find(
      (v) => normalizar(v.tamanho) === tamanhoNorm
    );

    if (encontradaPorTamanho?.id) {
      return encontradaPorTamanho;
    }
  }

  // Produto controlado somente por cor.
  if (corNorm) {
    const encontrada = variacoes.find(
      (v) => normalizar(v.cor) === corNorm
    );

    if (encontrada?.id) {
      return encontrada;
    }
  }

  return null;
}

async function lancarSaidaTiny(
  tinyIdProduto: string,
  quantidade: number,
  observacoes: string
) {
  const token = process.env.TINY_API_TOKEN?.trim();

  if (!token) {
    throw new Error("TINY_API_TOKEN não configurado.");
  }

  const quantidadeFinal = Number(quantidade);

  if (!Number.isFinite(quantidadeFinal) || quantidadeFinal <= 0) {
    throw new Error("Quantidade inválida para saída de estoque no Tiny.");
  }

  const body = new URLSearchParams({
    token,
    formato: "json",
    idProduto: String(tinyIdProduto),
    tipo: "S",
    quantidade: String(quantidadeFinal),
    observacoes,
  });

  const response = await fetch(
    `${TINY_BASE_URL}/produto.atualizar.estoque.php`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      cache: "no-store",
    }
  );

  const text = await response.text();

  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Resposta inválida do Tiny ao lançar saída. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.retorno?.erros
        ?.map((e: any) => e?.erro)
        .filter(Boolean)
        .join(" | ") ||
        `Tiny respondeu HTTP ${response.status}.`
    );
  }

  if (data?.retorno?.status !== "OK") {
    const erros =
      data?.retorno?.erros
        ?.map((e: any) => e?.erro)
        .filter(Boolean)
        .join(" | ") ||
      "Tiny recusou a atualização de estoque.";

    throw new Error(erros);
  }

  return data;
}

async function sincronizarItemComTiny(
  itemId: string
): Promise<{
  sucesso: boolean;
  mensagem: string;
}> {
  const item = await prisma.itemPedido.findUnique({
    where: { id: itemId },
    include: {
      produto: true,
      pedido: true,
    },
  });

  if (!item) {
    return {
      sucesso: false,
      mensagem: "Item do pedido não encontrado.",
    };
  }

  if (item.tinyEstoqueLancadoEm) {
    return {
      sucesso: true,
      mensagem: "Estoque deste item já havia sido enviado ao Tiny.",
    };
  }

  const produto = item.produto as any;

  let tinyId = produto.tinyId
    ? String(produto.tinyId)
    : "";

  const possuiVariacoes =
    obterVariacoesTiny(produto).length > 0;

  if (possuiVariacoes) {
    const variacao = encontrarVariacaoTiny(
      produto,
      item.tamanho ? String(item.tamanho) : null,
      item.cor ? String(item.cor) : null
    );

    if (!variacao?.id) {
      const erro =
        `Não foi encontrada a variação Tiny para "${produto.nome}"` +
        `${item.tamanho ? ` | tamanho: ${item.tamanho}` : ""}` +
        `${item.cor ? ` | cor: ${item.cor}` : ""}.`;

      await prisma.itemPedido.update({
        where: { id: item.id },
        data: {
          tinyEstoqueErro: erro,
        },
      });

      return {
        sucesso: false,
        mensagem: erro,
      };
    }

    tinyId = String(variacao.id);
  }

  if (!tinyId) {
    const erro =
      `Produto "${produto.nome}" não possui identificação no Tiny.`;

    await prisma.itemPedido.update({
      where: { id: item.id },
      data: {
        tinyEstoqueErro: erro,
      },
    });

    return {
      sucesso: false,
      mensagem: erro,
    };
  }

  try {
    await lancarSaidaTiny(
      tinyId,
      item.quantidade,
      `Saída referente ao pedido ${item.pedidoId} - produto ${produto.nome}`
    );

    await prisma.itemPedido.update({
      where: { id: item.id },
      data: {
        tinyEstoqueLancadoEm: new Date(),
        tinyEstoqueErro: null,
      },
    });

    return {
      sucesso: true,
      mensagem: `Saída de ${item.quantidade} unidade(s) enviada ao Tiny.`,
    };
  } catch (error: any) {
    const mensagem =
      error?.message ||
      "Erro desconhecido ao enviar estoque para o Tiny.";

    await prisma.itemPedido.update({
      where: { id: item.id },
      data: {
        tinyEstoqueErro: mensagem,
      },
    });

    return {
      sucesso: false,
      mensagem,
    };
  }
}

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { error: "ID do pedido não informado." },
        { status: 400 }
      );
    }

    let pedido = await prisma.pedido.findUnique({
      where: { id: String(orderId) },
      include: {
        itens: true,
      },
    });

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    // =========================================================
    // 1. PEDIDO AINDA NÃO PAGO
    // =========================================================

    if (pedido.status !== StatusPedido.PAGO) {
      const resultado = await prisma.$transaction(async (tx) => {
        const atualizacao = await tx.pedido.updateMany({
          where: {
            id: String(orderId),
            status: {
              not: StatusPedido.PAGO,
            },
          },
          data: {
            status: StatusPedido.PAGO,
          },
        });

        if (atualizacao.count === 0) {
          return {
            jaProcessado: true,
          };
        }

        for (const item of pedido!.itens) {
          const produto = await tx.produto.findUnique({
            where: { id: item.produtoId },
          });

          if (!produto) continue;

          const estoqueAtual = Number(produto.estoque || 0);
          const quantidade = Number(item.quantidade || 0);

          const novoEstoque = Math.max(
            0,
            estoqueAtual - quantidade
          );

          const estoquePorTamanho =
            produto.estoquePorTamanho &&
            typeof produto.estoquePorTamanho === "object" &&
            !Array.isArray(produto.estoquePorTamanho)
              ? {
                  ...(produto.estoquePorTamanho as Record<string, number>),
                }
              : {};

          const tamanho =
            item.tamanho?.trim() || "";

          if (
            tamanho &&
            Object.prototype.hasOwnProperty.call(
              estoquePorTamanho,
              tamanho
            )
          ) {
            estoquePorTamanho[tamanho] = Math.max(
              0,
              Number(estoquePorTamanho[tamanho] || 0) -
                quantidade
            );
          }

          await tx.produto.update({
            where: { id: item.produtoId },
            data: {
              estoque: novoEstoque,
              ...(Object.keys(estoquePorTamanho).length > 0
                ? {
                    estoquePorTamanho:
                      estoquePorTamanho,
                  }
                : {}),
            },
          });
        }

        return {
          jaProcessado: false,
        };
      });

      if (resultado.jaProcessado) {
        pedido = await prisma.pedido.findUnique({
          where: { id: String(orderId) },
          include: {
            itens: true,
          },
        });

        if (!pedido) {
          return NextResponse.json(
            { error: "Pedido não encontrado após atualização." },
            { status: 404 }
          );
        }
      }
    }

    // =========================================================
    // 2. ENVIA SOMENTE AS BAIXAS QUE AINDA NÃO FORAM ENVIADAS
    // =========================================================

    const resultadosTiny = [];

    for (const item of pedido.itens) {
      const resultado = await sincronizarItemComTiny(
        item.id
      );

      resultadosTiny.push({
        itemId: item.id,
        sucesso: resultado.sucesso,
        mensagem: resultado.mensagem,
      });
    }

    const falhasTiny = resultadosTiny.filter(
      (resultado) => !resultado.sucesso
    );

    return NextResponse.json({
      success: true,
      message:
        falhasTiny.length === 0
          ? "Pedido confirmado, estoque baixado no site e enviado ao Tiny com sucesso!"
          : "Pedido confirmado e estoque baixado no site. Algumas baixas no Tiny ficaram pendentes e serão tentadas novamente.",
      tiny: {
        sucesso: falhasTiny.length === 0,
        itens: resultadosTiny,
      },
    });
  } catch (error: any) {
    console.error(
      "Erro ao confirmar o pedido:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro interno ao processar a confirmação do pedido.",
      },
      { status: 500 }
    );
  }
}
