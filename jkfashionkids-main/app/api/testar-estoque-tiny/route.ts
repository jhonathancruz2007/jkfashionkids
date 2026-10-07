import { NextResponse } from "next/server";

const TINY_TOKEN = process.env.TINY_API_TOKEN?.trim();

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

function mensagemTiny(data: any): string {
  return (
    data?.retorno?.erros?.[0]?.erro?.descricao ||
    data?.retorno?.erros?.[0]?.erro?.mensagem ||
    data?.retorno?.erros?.[0]?.descricao ||
    data?.retorno?.mensagem ||
    "Sem mensagem retornada pelo Tiny."
  );
}

async function tinyPost(
  endpoint: string,
  params: Record<string, string>
) {
  if (!TINY_TOKEN) {
    throw new Error("TINY_API_TOKEN não configurado.");
  }

  const body = new URLSearchParams();

  body.set("token", TINY_TOKEN);
  body.set("formato", "json");

  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }

  const url = `https://api.tiny.com.br/api2/${endpoint}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const raw = await response.text();

  let json: any = null;

  try {
    json = JSON.parse(raw);
  } catch {
    // Mantém a resposta bruta para diagnóstico.
  }

  return {
    url,
    status: response.status,
    ok: response.ok,
    raw,
    json,
  };
}

export async function GET(request: Request) {
  try {
    if (!TINY_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          erro: "TINY_API_TOKEN não configurado.",
        },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const idInformado = url.searchParams.get("id")?.trim();

    /*
     * TESTE 1
     * Caso o usuário informe um ID diretamente:
     *
     * /api/testar-estoque-tiny?id=123456
     *
     * vamos testar esse ID.
     */
    let idTestado = idInformado || "";

    /*
     * TESTE 2
     * Se não houver ID, procuramos um produto na API de pesquisa.
     */
    let pesquisa: any = null;

    if (!idTestado) {
      pesquisa = await tinyPost("produtos.pesquisa.php", {
        pagina: "1",
      });

      if (!pesquisa.json) {
        return NextResponse.json({
          success: false,
          etapa: "pesquisa",
          mensagem: "O Tiny não retornou JSON válido.",
          http: pesquisa.status,
          respostaBruta: pesquisa.raw,
        });
      }

      if (pesquisa.json?.retorno?.status !== "OK") {
        return NextResponse.json({
          success: false,
          etapa: "pesquisa",
          http: pesquisa.status,
          mensagem: mensagemTiny(pesquisa.json),
          respostaTiny: pesquisa.json,
        });
      }

      const lista = pesquisa.json?.retorno?.produtos || [];

      if (!Array.isArray(lista) || lista.length === 0) {
        return NextResponse.json({
          success: false,
          etapa: "pesquisa",
          mensagem: "Nenhum produto foi retornado pelo Tiny.",
          respostaTiny: pesquisa.json,
        });
      }

      const primeiro = lista[0]?.produto;

      if (!primeiro?.id) {
        return NextResponse.json({
          success: false,
          etapa: "pesquisa",
          mensagem:
            "O primeiro registro retornado pelo Tiny não possui ID.",
          primeiroRegistro: primeiro,
          respostaTiny: pesquisa.json,
        });
      }

      idTestado = texto(primeiro.id);
    }

    /*
     * TESTE 3
     * Consulta diretamente o estoque do ID selecionado.
     */
    const estoque = await tinyPost(
      "produto.obter.estoque.php",
      {
        id: idTestado,
      }
    );

    const produtoEstoque = estoque.json?.retorno?.produto;

    let saldoDireto: number | null = null;

    if (
      produtoEstoque &&
      produtoEstoque.saldo !== undefined &&
      produtoEstoque.saldo !== null
    ) {
      saldoDireto = numero(produtoEstoque.saldo);
    }

    const depositos = Array.isArray(produtoEstoque?.depositos)
      ? produtoEstoque.depositos
      : [];

    const depositosTratados = depositos.map((item: any) => {
      const deposito = item?.deposito || {};

      return {
        id: texto(deposito.id),
        nome: texto(deposito.nome),
        desconsiderar: texto(deposito.desconsiderar),
        saldo: numero(deposito.saldo),
        saldoReservado: numero(deposito.saldoReservado),
      };
    });

    const saldoDepositos = depositosTratados.reduce(
      (total: number, deposito: any) => {
        if (deposito.desconsiderar === "S") {
          return total;
        }

        return total + deposito.saldo;
      },
      0
    );

    return NextResponse.json({
      success: estoque.status === 200,

      diagnostico: {
        idTestado,
        endpoint: "produto.obter.estoque.php",
        httpStatus: estoque.status,
        httpOk: estoque.ok,

        tinyStatus:
          estoque.json?.retorno?.status ??
          null,

        mensagemTiny: estoque.json
          ? mensagemTiny(estoque.json)
          : null,

        saldoDireto,
        saldoConsiderandoDepositos: saldoDepositos,

        depositos: depositosTratados,
      },

      respostaTiny: estoque.json,

      respostaBruta:
        estoque.json
          ? null
          : estoque.raw,
    });
  } catch (error: any) {
    console.error(
      "Erro no teste isolado de estoque Tiny:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        erro:
          error?.message ||
          "Erro interno no teste de estoque.",
      },
      { status: 500 }
    );
  }
}
