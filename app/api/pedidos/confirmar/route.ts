import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatusPedido } from "@prisma/client";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_LOJA = "contato@jkfashionkids.com.br";
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  "JK Fashion Kids <contato@jkfashionkids.com.br>";

const INFINITEPAY_CHECK_URL =
  "https://api.checkout.infinitepay.io/payment_check";

const TINY_BASE_URL = "https://api.tiny.com.br/api2";

type ResultadoBaixaItem = {
  itemId: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  estoqueAntes: number;
  estoqueDepois: number;
  tamanho: string | null;
  cor: string | null;
  tamanhoAtualizado: boolean;
  corAtualizada: boolean;
};

type TinyVariacao = {
  id?: string | number;
  codigo?: string;
  tamanho?: string;
  cor?: string;
};

type ResultadoTiny = {
  sucesso: boolean;
  mensagem: string;
};

type ResultadoEmail = {
  loja: {
    sucesso: boolean;
    id: string | null;
    erro: string | null;
  };
  cliente: {
    sucesso: boolean;
    id: string | null;
    erro: string | null;
  };
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
  if (variacoes.length === 0) return null;

  const tamanhoNorm = normalizar(tamanho);
  const corNorm = normalizar(cor);

  if (tamanhoNorm && corNorm) {
    const encontrada = variacoes.find(
      (v) =>
        normalizar(v.tamanho) === tamanhoNorm &&
        normalizar(v.cor) === corNorm
    );

    if (encontrada?.id) return encontrada;
  }

  if (tamanhoNorm) {
    const encontradaSemCor = variacoes.find(
      (v) =>
        normalizar(v.tamanho) === tamanhoNorm &&
        !normalizar(v.cor)
    );

    if (encontradaSemCor?.id) return encontradaSemCor;

    const encontradaPorTamanho = variacoes.find(
      (v) => normalizar(v.tamanho) === tamanhoNorm
    );

    if (encontradaPorTamanho?.id) return encontradaPorTamanho;
  }

  if (corNorm) {
    const encontrada = variacoes.find(
      (v) => normalizar(v.cor) === corNorm
    );

    if (encontrada?.id) return encontrada;
  }

  return null;
}

async function verificarPagamentoInfinitePay(args: {
  orderNsu: string;
  transactionNsu: string | null;
  slug: string | null;
}) {
  const handle = process.env.INFINITEPAY_HANDLE?.trim();

  if (!handle) {
    throw new Error("INFINITEPAY_HANDLE não configurado.");
  }

  if (!args.transactionNsu) {
    throw new Error(
      "A InfinitePay não enviou o transaction_nsu necessário para confirmar o pagamento."
    );
  }

  if (!args.slug) {
    throw new Error(
      "A InfinitePay não enviou o slug necessário para confirmar o pagamento."
    );
  }

  const response = await fetch(INFINITEPAY_CHECK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      handle,
      order_nsu: args.orderNsu,
      transaction_nsu: args.transactionNsu,
      slug: args.slug,
    }),
    cache: "no-store",
  });

  const text = await response.text();
  let data: any = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Resposta inválida da InfinitePay ao verificar o pagamento. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `InfinitePay retornou HTTP ${response.status} ao verificar o pagamento.`
    );
  }

  if (data?.success !== true || data?.paid !== true) {
    throw new Error(
      "A InfinitePay não confirmou o pagamento desta transação."
    );
  }

  return data;
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
        .join(" | ") || `Tiny respondeu HTTP ${response.status}.`
    );
  }

  if (data?.retorno?.status !== "OK") {
    throw new Error(
      data?.retorno?.erros
        ?.map((e: any) => e?.erro)
        .filter(Boolean)
        .join(" | ") || "Tiny recusou a atualização de estoque."
    );
  }

  return data;
}

async function sincronizarItemComTiny(item: any): Promise<ResultadoTiny> {
  if (!item?.produto) {
    return {
      sucesso: false,
      mensagem: "Produto do item não encontrado.",
    };
  }

  const produto = item.produto as any;
  let tinyId = produto?.tinyId ? String(produto.tinyId) : "";
  const possuiVariacoes = obterVariacoesTiny(produto).length > 0;

  if (possuiVariacoes) {
    const variacao = encontrarVariacaoTiny(
      produto,
      item.tamanho ? String(item.tamanho) : null,
      item.cor ? String(item.cor) : null
    );

    if (!variacao?.id) {
      return {
        sucesso: false,
        mensagem:
          `Não foi encontrada a variação Tiny para "${produto.nome}"` +
          `${item.tamanho ? ` | tamanho: ${item.tamanho}` : ""}` +
          `${item.cor ? ` | cor: ${item.cor}` : ""}.`,
      };
    }

    tinyId = String(variacao.id);
  }

  if (!tinyId) {
    return {
      sucesso: false,
      mensagem: `Produto "${produto.nome}" não possui identificação no Tiny.`,
    };
  }

  try {
    await lancarSaidaTiny(
      tinyId,
      Number(item.quantidade || 0),
      `Saída referente ao pedido ${item.pedidoId} - produto ${produto.nome}`
    );

    return {
      sucesso: true,
      mensagem: `Saída de ${item.quantidade} unidade(s) enviada ao Tiny.`,
    };
  } catch (error: any) {
    return {
      sucesso: false,
      mensagem:
        error?.message || "Erro desconhecido ao enviar estoque para o Tiny.",
    };
  }
}

async function enviarEmailsPedidoPago(
  pedido: any,
  transactionId: string | null = null
): Promise<ResultadoEmail> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  const resultadoEmail: ResultadoEmail = {
    loja: { sucesso: false, id: null, erro: null },
    cliente: { sucesso: false, id: null, erro: null },
  };

  if (!apiKey) {
    const erro =
      "RESEND_API_KEY não configurada nas variáveis de ambiente.";
    resultadoEmail.loja.erro = erro;
    resultadoEmail.cliente.erro = erro;
    return resultadoEmail;
  }

  const resend = new Resend(apiKey);
  const cliente = pedido?.cliente;
  const idPedido = String(pedido?.id || "").trim();
  const idCurto = idPedido.slice(0, 8) || "------";
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
  const clienteNome = escaparHtml(cliente?.nome || "Não informado");
  const clienteEmail = escaparHtml(cliente?.email || "Não informado");
  const clienteTelefone = escaparHtml(
    cliente?.telefone || "Não informado"
  );
  const transactionHtml = transactionId
    ? `<p style="margin:6px 0;"><strong>ID da transação:</strong> ${escaparHtml(transactionId)}</p>`
    : `<p style="margin:6px 0;"><strong>ID da transação:</strong> Não informado</p>`;

  try {
    const { data, error } = await resend.emails.send(
      {
        from: EMAIL_FROM,
        to: [EMAIL_LOJA],
        subject: `🔔 NOVO PEDIDO PAGO #${idCurto} - Separar Estoque`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;">
            <div style="max-width:700px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
              <h1 style="margin:0 0 8px;font-size:24px;">Novo pedido aprovado! 📦</h1>
              <p style="margin:0 0 18px;">O pedido <strong>#${escaparHtml(idCurto)}</strong> foi confirmado e a baixa de estoque foi processada.</p>
              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Cliente</h2>
                <p style="margin:6px 0;"><strong>Nome:</strong> ${clienteNome}</p>
                <p style="margin:6px 0;"><strong>E-mail:</strong> ${clienteEmail}</p>
                <p style="margin:6px 0;"><strong>Telefone:</strong> ${clienteTelefone}</p>
                <p style="margin:6px 0;"><strong>Endereço:</strong> ${linhasEndereco}</p>
              </div>
              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Pagamento</h2>
                <p style="margin:6px 0;"><strong>Status:</strong> PAGO</p>
                <p style="margin:6px 0;"><strong>Forma:</strong> ${escaparHtml(metodoPagamento)}</p>
                ${transactionHtml}
                <p style="margin:6px 0;"><strong>Total:</strong> ${formatarMoeda(total)}</p>
              </div>
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
                <h2 style="margin:0 0 10px;font-size:16px;">Produtos</h2>
                <table style="width:100%;border-collapse:collapse;"><tbody>${linhasItens || '<tr><td>Nenhum item encontrado.</td></tr>'}</tbody></table>
              </div>
            </div>
          </div>
        `,
      },
      { idempotencyKey: `pedido-email-loja-${idPedido}` }
    );

    if (error) {
      resultadoEmail.loja.erro = error.message || "Erro retornado pelo Resend.";
    } else {
      resultadoEmail.loja.sucesso = true;
      resultadoEmail.loja.id = data?.id || null;
    }
  } catch (error: any) {
    resultadoEmail.loja.erro =
      error?.message || "Erro desconhecido ao enviar e-mail para a loja.";
  }

  if (cliente?.email) {
    try {
      const { data, error } = await resend.emails.send(
        {
          from: EMAIL_FROM,
          to: [cliente.email],
          subject: `Pagamento confirmado! Pedido #${idCurto}`,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f8fafc;padding:24px;">
              <div style="max-width:700px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
                <h1 style="margin:0 0 8px;font-size:24px;">Olá, ${escaparHtml(primeiroNome)}! 🎉</h1>
                <p style="margin:0 0 18px;">Seu pagamento foi confirmado para o pedido <strong>#${escaparHtml(idCurto)}</strong>.</p>
                <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:18px;">
                  <h2 style="margin:0 0 10px;font-size:16px;">Resumo da compra</h2>
                  <table style="width:100%;border-collapse:collapse;"><tbody>${linhasItens || '<tr><td>Nenhum item encontrado.</td></tr>'}</tbody></table>
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
        },
        { idempotencyKey: `pedido-email-cliente-${idPedido}` }
      );

      if (error) {
        resultadoEmail.cliente.erro =
          error.message || "Erro retornado pelo Resend.";
      } else {
        resultadoEmail.cliente.sucesso = true;
        resultadoEmail.cliente.id = data?.id || null;
      }
    } catch (error: any) {
      resultadoEmail.cliente.erro =
        error?.message ||
        "Erro desconhecido ao enviar e-mail para o cliente.";
    }
  } else {
    resultadoEmail.cliente.erro =
      "O pedido não possui um e-mail de cliente válido cadastrado.";
  }

  return resultadoEmail;
}

async function baixarEstoqueLocal(pedido: any): Promise<{
  executado: boolean;
  itens: ResultadoBaixaItem[];
}> {
  return prisma.$transaction(async (tx) => {
    // A troca para PAGO funciona como trava/idempotência.
    // Apenas uma chamada consegue obter count=1.
    const atualizacao = await tx.pedido.updateMany({
      where: {
        id: String(pedido.id),
        status: {
          not: StatusPedido.PAGO,
        },
      },
      data: {
        status: StatusPedido.PAGO,
      },
    });

    if (atualizacao.count === 0) {
      return { executado: false, itens: [] };
    }

    const resultados: ResultadoBaixaItem[] = [];

    for (const item of pedido.itens) {
      const quantidade = Math.max(0, Number(item.quantidade || 0));

      if (quantidade <= 0) {
        throw new Error(
          `Quantidade inválida no item ${item.id} do pedido ${pedido.id}.`
        );
      }

      const produto = await tx.produto.findUnique({
        where: { id: item.produtoId },
      });

      if (!produto) {
        // Fazemos rollback em vez de marcar o pedido como PAGO sem baixa.
        throw new Error(
          `Produto ${item.produtoId} não encontrado para o pedido ${pedido.id}.`
        );
      }

      const estoqueAntes = Number(produto.estoque || 0);
      const estoqueDepois = Math.max(0, estoqueAntes - quantidade);

      const estoquePorTamanho =
        produto.estoquePorTamanho &&
        typeof produto.estoquePorTamanho === "object" &&
        !Array.isArray(produto.estoquePorTamanho)
          ? (JSON.parse(JSON.stringify(produto.estoquePorTamanho)) as Record<
              string,
              any
            >)
          : {};

      const estoquePorCor =
        produto.estoquePorCor &&
        typeof produto.estoquePorCor === "object" &&
        !Array.isArray(produto.estoquePorCor)
          ? (JSON.parse(JSON.stringify(produto.estoquePorCor)) as Record<
              string,
              any
            >)
          : {};

      const tamanho = String(item.tamanho || "").trim();
      const cor = String(item.cor || "").trim();
      let tamanhoAtualizado = false;
      let corAtualizada = false;

      if (tamanho) {
        const chaveTamanho = Object.keys(estoquePorTamanho).find(
          (chave) => normalizar(chave) === normalizar(tamanho)
        );

        if (chaveTamanho) {
          estoquePorTamanho[chaveTamanho] = Math.max(
            0,
            Number(estoquePorTamanho[chaveTamanho] || 0) - quantidade
          );
          tamanhoAtualizado = true;
        }
      }

      if (cor) {
        const chaveCor = Object.keys(estoquePorCor).find(
          (chave) => normalizar(chave) === normalizar(cor)
        );

        if (chaveCor) {
          const estoqueDaCor = estoquePorCor[chaveCor];

          if (
            tamanho &&
            estoqueDaCor &&
            typeof estoqueDaCor === "object" &&
            !Array.isArray(estoqueDaCor)
          ) {
            const chaveTamanhoCor = Object.keys(estoqueDaCor).find(
              (chave) => normalizar(chave) === normalizar(tamanho)
            );

            if (chaveTamanhoCor) {
              estoqueDaCor[chaveTamanhoCor] = Math.max(
                0,
                Number(estoqueDaCor[chaveTamanhoCor] || 0) - quantidade
              );
              corAtualizada = true;
            }
          } else if (
            typeof estoqueDaCor === "number" ||
            typeof estoqueDaCor === "string"
          ) {
            estoquePorCor[chaveCor] = Math.max(
              0,
              Number(estoqueDaCor || 0) - quantidade
            );
            corAtualizada = true;
          }
        }
      }

      await tx.produto.update({
        where: { id: produto.id },
        data: {
          estoque: estoqueDepois,
          ...(Object.keys(estoquePorTamanho).length > 0
            ? { estoquePorTamanho }
            : {}),
          ...(Object.keys(estoquePorCor).length > 0
            ? { estoquePorCor }
            : {}),
        },
      });

      resultados.push({
        itemId: String(item.id),
        produtoId: String(item.produtoId),
        produtoNome: String(produto.nome || "Produto"),
        quantidade,
        estoqueAntes,
        estoqueDepois,
        tamanho: tamanho || null,
        cor: cor || null,
        tamanhoAtualizado,
        corAtualizada,
      });
    }

    return { executado: true, itens: resultados };
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const orderId = body?.orderId
      ? String(body.orderId).trim()
      : body?.order_nsu
        ? String(body.order_nsu).trim()
        : "";

    const transactionId = body?.transactionId
      ? String(body.transactionId).trim()
      : body?.transaction_nsu
        ? String(body.transaction_nsu).trim()
        : null;

    const slug = body?.slug ? String(body.slug).trim() : null;

    const receiptUrl = body?.receipt_url
      ? String(body.receipt_url).trim()
      : null;

    const captureMethod = body?.capture_method
      ? String(body.capture_method).trim()
      : null;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "ID do pedido não informado." },
        { status: 400 }
      );
    }

    let pedido = await prisma.pedido.findUnique({
      where: { id: orderId },
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
        { success: false, error: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    const estavaPago = pedido.status === StatusPedido.PAGO;

    // Se ainda não estiver pago, validamos a transação diretamente na InfinitePay
    // antes de mudar o pedido e antes de baixar o estoque.
    let pagamentoVerificado: any = null;

    if (!estavaPago) {
      pagamentoVerificado = await verificarPagamentoInfinitePay({
        orderNsu: orderId,
        transactionNsu: transactionId,
        slug,
      });

      const resultadoBaixa = await baixarEstoqueLocal(pedido);

      if (!resultadoBaixa.executado) {
        return NextResponse.json({
          success: true,
          orderId,
          alreadyPaid: true,
          baixaEstoque: {
            executada: false,
            itens: [],
            motivo: "Outra requisição confirmou o pedido primeiro.",
          },
          pagamento: {
            verificado: true,
            paid: pagamentoVerificado?.paid === true,
            amount: pagamentoVerificado?.amount ?? null,
            paidAmount: pagamentoVerificado?.paid_amount ?? null,
            captureMethod:
              pagamentoVerificado?.capture_method || captureMethod || null,
          },
        });
      }

      pedido = await prisma.pedido.findUnique({
        where: { id: orderId },
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
          {
            success: false,
            error: "Pedido não encontrado após baixa do estoque.",
          },
          { status: 404 }
        );
      }

      let resultadosTiny: Array<{
        itemId: string;
        sucesso: boolean;
        mensagem: string;
      }> = [];

      for (const item of pedido.itens) {
        const resultado = await sincronizarItemComTiny(item);
        resultadosTiny.push({
          itemId: item.id,
          sucesso: resultado.sucesso,
          mensagem: resultado.mensagem,
        });
      }

      const emails = await enviarEmailsPedidoPago(pedido, transactionId);
      const falhasTiny = resultadosTiny.filter(
        (resultado) => !resultado.sucesso
      );

      return NextResponse.json({
        success: true,
        orderId,
        alreadyPaid: false,
        pagamento: {
          verificado: true,
          paid: pagamentoVerificado?.paid === true,
          amount: pagamentoVerificado?.amount ?? null,
          paidAmount: pagamentoVerificado?.paid_amount ?? null,
          captureMethod:
            pagamentoVerificado?.capture_method || captureMethod || null,
          transactionNsu:
            pagamentoVerificado?.transaction_nsu || transactionId || null,
          slug,
          receiptUrl,
        },
        baixaEstoque: {
          executada: true,
          itens: resultadoBaixa.itens,
        },
        tiny: {
          sucesso: falhasTiny.length === 0,
          itens: resultadosTiny,
        },
        emails,
        message:
          falhasTiny.length === 0
            ? "Pagamento verificado e estoque processado com sucesso."
            : "Pagamento verificado e estoque local baixado. Algumas baixas no Tiny ficaram pendentes.",
      });
    }

    // Pedido já estava PAGO: não baixamos novamente o estoque local.
    // Também não repetimos a saída do Tiny, pois o schema atual não possui
    // marcador persistente de lançamento no Tiny.
    const emails = await enviarEmailsPedidoPago(pedido, transactionId);

    return NextResponse.json({
      success: true,
      orderId,
      alreadyPaid: true,
      pagamento: {
        verificado: false,
        motivo: "Pedido já estava PAGO; nenhuma nova baixa foi executada.",
        transactionNsu: transactionId,
        slug,
        receiptUrl,
        captureMethod,
      },
      baixaEstoque: {
        executada: false,
        itens: [],
        motivo: "Pedido já estava PAGO.",
      },
      tiny: {
        sucesso: true,
        itens: pedido.itens.map((item: any) => ({
          itemId: item.id,
          sucesso: true,
          mensagem:
            "Pedido já estava pago; nenhuma nova baixa foi lançada no Tiny.",
        })),
      },
      emails,
      message: "Pedido já estava confirmado anteriormente.",
    });
  } catch (error: any) {
    console.error("❌ Erro ao confirmar o pedido:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro interno ao processar a confirmação do pedido.",
      },
      { status: 500 }
    );
  }
}
