import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_LOJA = "contato@jkfashionkids.com.br";
const EMAIL_FROM = "JK Fashion Kids <contato@jkfashionkids.com.br>";

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

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatarMoeda(valor: unknown): string {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function montarEndereco(cliente: any): string {
  if (!cliente) return "Não informado";

  const partes = [
    cliente.rua,
    cliente.numero ? `nº ${cliente.numero}` : null,
    cliente.complemento,
    cliente.bairro,
    cliente.cidade,
    cliente.estado,
    cliente.cep ? `CEP ${cliente.cep}` : null,
  ].filter((parte) => String(parte ?? "").trim());

  return partes.length > 0 ? partes.join(", ") : "Não informado";
}

async function enviarEmailsPedidoPago(
  pedido: any,
  transactionId: string | null = null
) {
  const cliente = pedido?.cliente;
  const idCurto = String(pedido?.id || "").slice(0, 8) || "------";
  const primeiroNome =
    cliente?.nome?.trim()?.split(/\s+/)?.[0] || "Cliente";

  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
  const total = Number(pedido?.total || 0);
  const metodoPagamento =
    String(pedido?.metodoPagamento || "Não informado").trim() ||
    "Não informado";
  const endereco = montarEndereco(cliente);

  const linhasItens = itens
    .map((item: any) => {
      const nome = escaparHtml(
        item?.produto?.nome || item?.nome || "Produto"
      );
      const quantidade = Number(item?.quantidade || 1);
      const tamanho = item?.tamanho
        ? ` · Tamanho: <strong>${escaparHtml(item.tamanho)}</strong>`
        : "";
      const cor = item?.cor
        ? ` · Cor: <strong>${escaparHtml(item.cor)}</strong>`
        : "";
      const valorUnitario = Number(item?.precoUnitario || 0);
      const subtotal = quantidade * valorUnitario;

      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
            <strong>${quantidade}x ${nome}</strong><br />
            <span style="font-size:12px;color:#64748b;">${tamanho}${cor}</span>
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
            ${formatarMoeda(valorUnitario)} / un.<br />
            <strong>${formatarMoeda(subtotal)}</strong>
          </td>
        </tr>
      `;
    })
    .join("");

  const linhasEndereco = escaparHtml(endereco);
  const linhasCliente = {
    nome: escaparHtml(cliente?.nome || "Não informado"),
    email: escaparHtml(cliente?.email || "Não informado"),
    telefone: escaparHtml(cliente?.telefone || "Não informado"),
  };

  const transactionHtml = transactionId
    ? `<p style="margin:6px 0;"><strong>ID da transação:</strong> ${escaparHtml(transactionId)}</p>`
    : `<p style="margin:6px 0;"><strong>ID da transação:</strong> Não informado</p>`;

  const assuntoLoja = `🔔 NOVO PEDIDO PAGO #${idCurto} - Separar Estoque`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: [EMAIL_LOJA],
      subject: assuntoLoja,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;">
          <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <div style="padding:24px;background:#111827;color:#ffffff;">
              <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;opacity:.75;">JK Fashion Kids</div>
              <h1 style="margin:6px 0 0;font-size:24px;">Novo pedido pago 📦</h1>
              <p style="margin:8px 0 0;font-size:14px;opacity:.85;">Pedido #${escaparHtml(idCurto)} confirmado pelo sistema.</p>
            </div>

            <div style="padding:24px;">
              <div style="display:block;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Dados do cliente</h2>
                <p style="margin:6px 0;"><strong>Nome:</strong> ${linhasCliente.nome}</p>
                <p style="margin:6px 0;"><strong>E-mail:</strong> ${linhasCliente.email}</p>
                <p style="margin:6px 0;"><strong>Telefone:</strong> ${linhasCliente.telefone}</p>
                <p style="margin:6px 0;"><strong>Endereço:</strong> ${linhasEndereco}</p>
              </div>

              <div style="display:block;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Pagamento</h2>
                <p style="margin:6px 0;"><strong>Status:</strong> PAGO</p>
                <p style="margin:6px 0;"><strong>Forma de pagamento:</strong> ${escaparHtml(metodoPagamento)}</p>
                ${transactionHtml}
                <p style="margin:6px 0;"><strong>Total do pedido:</strong> <span style="font-size:18px;font-weight:700;">${formatarMoeda(total)}</span></p>
              </div>

              <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Produtos comprados</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tbody>
                    ${linhasItens || '<tr><td style="padding:10px 8px;">Nenhum item encontrado.</td></tr>'}
                  </tbody>
                </table>
              </div>

              <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b;">
                Este e-mail foi enviado automaticamente após a confirmação do pagamento. A baixa do estoque local e a baixa correspondente no Tiny são processadas pelo fluxo de confirmação do pedido.
              </div>
            </div>
          </div>
        </div>
      `,
    });

    console.log(`✅ [E-MAIL LOJA ENVIADO] Pedido #${idCurto}`);
  } catch (error: any) {
    console.error("❌ Erro ao enviar e-mail interno da loja:", error);
  }

  if (cliente?.email) {
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: [cliente.email],
        subject: `Pagamento confirmado! Pedido #${idCurto}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;">
            <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
              <h1 style="margin:0 0 8px;font-size:24px;">Olá, ${escaparHtml(primeiroNome)}! 🎉</h1>
              <p style="margin:0 0 18px;">Seu pagamento foi confirmado para o pedido <strong>#${escaparHtml(idCurto)}</strong>.</p>

              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Resumo da compra</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tbody>${linhasItens || '<tr><td style="padding:10px 0;">Nenhum item encontrado.</td></tr>'}</tbody>
                </table>
              </div>

              <p style="margin:6px 0;"><strong>Forma de pagamento:</strong> ${escaparHtml(metodoPagamento)}</p>
              <p style="margin:6px 0 16px;"><strong>Total:</strong> ${formatarMoeda(total)}</p>

              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                <p style="margin:0 0 6px;"><strong>Endereço:</strong></p>
                <p style="margin:0;color:#475569;line-height:1.6;">${linhasEndereco}</p>
              </div>

              <p style="margin:20px 0 0;color:#475569;">Já estamos preparando seu pedido. Obrigado por comprar com a <strong>JK Fashion Kids</strong>!</p>
            </div>
          </div>
        `,
      });

      console.log(`✅ [E-MAIL CLIENTE ENVIADO] Para: ${cliente.email}`);
    } catch (error: any) {
      console.error("❌ Erro ao enviar e-mail para o cliente:", error);
    }
  }
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
    const body = await req.json();
    const orderId = body?.orderId;
    const transactionId = body?.transactionId
      ? String(body.transactionId)
      : null;

    let pedidoFoiConfirmadoAgora = false;

    if (!orderId) {
      return NextResponse.json(
        { error: "ID do pedido não informado." },
        { status: 400 }
      );
    }

    let pedido = await prisma.pedido.findUnique({
      where: { id: String(orderId) },
      include: {
        cliente: true,
        itens: {
          include: {
            produto: true,
          },
        },
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

      if (!resultado.jaProcessado) {
        pedidoFoiConfirmadoAgora = true;
      }

      if (resultado.jaProcessado) {
        pedido = await prisma.pedido.findUnique({
          where: { id: String(orderId) },
          include: {
            cliente: true,
            itens: {
              include: {
                produto: true,
              },
            },
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

    // Envia os e-mails somente na primeira confirmação efetiva do pedido.
    // Recarregar a página de sucesso não dispara novos e-mails.
    if (pedidoFoiConfirmadoAgora) {
      await enviarEmailsPedidoPago(pedido, transactionId);
    }

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
