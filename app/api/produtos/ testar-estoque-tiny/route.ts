import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TINY_BASE_URL = "https://api.tiny.com.br/api2"

type TinyAny = Record<string, any>

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim()
}

function number(value: unknown): number {
  const n = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function tinyErrors(data: TinyAny): string[] {
  return Array.isArray(data?.retorno?.erros)
    ? data.retorno.erros.map((e: any) => text(e?.erro)).filter(Boolean)
    : []
}

async function tinyPost(
  endpoint: string,
  params: Record<string, string | number>
) {
  const token = process.env.TINY_API_TOKEN?.trim()

  if (!token) {
    throw new Error("TINY_API_TOKEN não encontrada no servidor.")
  }

  const body = new URLSearchParams()
  body.set("token", token)
  body.set("formato", "json")

  for (const [key, value] of Object.entries(params)) {
    body.set(key, String(value))
  }

  const response = await fetch(`${TINY_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  })

  const raw = await response.text()

  let json: TinyAny = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    json = null
  }

  return {
    endpoint,
    method: "POST",
    status: response.status,
    ok: response.ok,
    headers: {
      allow: response.headers.get("allow"),
      contentType: response.headers.get("content-type"),
      xLimitApi: response.headers.get("x-limit-api"),
      retryAfter: response.headers.get("retry-after"),
      server: response.headers.get("server"),
    },
    json,
    raw,
  }
}

async function tinyGet(
  endpoint: string,
  params: Record<string, string | number>
) {
  const token = process.env.TINY_API_TOKEN?.trim()

  if (!token) {
    throw new Error("TINY_API_TOKEN não encontrada no servidor.")
  }

  const query = new URLSearchParams()
  query.set("token", token)
  query.set("formato", "json")

  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value))
  }

  const response = await fetch(
    `${TINY_BASE_URL}/${endpoint}?${query.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  )

  const raw = await response.text()

  let json: TinyAny = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    json = null
  }

  return {
    endpoint,
    method: "GET",
    status: response.status,
    ok: response.ok,
    headers: {
      allow: response.headers.get("allow"),
      contentType: response.headers.get("content-type"),
      xLimitApi: response.headers.get("x-limit-api"),
      retryAfter: response.headers.get("retry-after"),
      server: response.headers.get("server"),
    },
    json,
    raw,
  }
}

function extrairVariacao(produto: TinyAny): TinyAny | null {
  const raw = produto?.variacoes

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const v = item?.variacao ?? item
      if (v?.id) return v
    }
  }

  if (raw && typeof raw === "object") {
    for (const item of Object.values(raw)) {
      const v = (item as any)?.variacao ?? item
      if ((v as any)?.id) return v
    }
  }

  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const requestedId = text(url.searchParams.get("id"))

  try {
    if (!process.env.TINY_API_TOKEN?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "TINY_API_TOKEN não encontrada no servidor.",
        },
        { status: 500 }
      )
    }

    let testId = requestedId
    let discovery: TinyAny = null
    let productDetails: TinyAny = null

    // 1) Se o usuário passou um ID, testamos exatamente esse ID.
    // 2) Caso contrário, descobrimos automaticamente um ID do Tiny.
    if (!testId) {
      discovery = await tinyPost("produtos.pesquisa.php", {
        pesquisa: "",
        pagina: 1,
      })

      const produtos = discovery?.json?.retorno?.produtos ?? []
      const primeiro = produtos.find((item: any) => item?.produto?.id)?.produto

      if (!primeiro?.id) {
        return NextResponse.json({
          success: false,
          etapa: "pesquisa",
          discovery,
          error: "A pesquisa do Tiny não retornou nenhum produto com ID.",
        })
      }

      testId = text(primeiro.id)

      // Se o primeiro registro for produto pai, obtemos uma de suas variações.
      if (text(primeiro.tipoVariacao).toUpperCase() === "P") {
        productDetails = await tinyPost("produto.obter.php", {
          id: testId,
        })

        const variacao = extrairVariacao(productDetails?.json?.retorno?.produto)

        if (variacao?.id) {
          testId = text(variacao.id)
        }
      }
    }

    // Teste real do endpoint de estoque com POST, sem Prisma e sem nenhuma gravação.
    const postStock = await tinyPost("produto.obter.estoque.php", {
      id: testId,
    })

    let getStock: TinyAny = null

    // Se POST retornar 405, testamos GET apenas para diagnosticar.
    if (postStock.status === 405) {
      getStock = await tinyGet("produto.obter.estoque.php", {
        id: testId,
      })
    }

    const postErrors = tinyErrors(postStock.json)
    const getErrors = tinyErrors(getStock?.json)

    const produtoEstoque = postStock?.json?.retorno?.produto
    const saldo = produtoEstoque?.saldo

    return NextResponse.json({
      success: true,
      diagnostico: {
        mensagem:
          postStock.status === 200
            ? "O endpoint de estoque respondeu corretamente via POST."
            : postStock.status === 405
              ? "O Tiny respondeu 405 ao POST. O teste GET foi executado para comparação."
              : `O endpoint de estoque respondeu HTTP ${postStock.status}.`,
        idTestado: testId,
        saldoRetornado: saldo !== undefined ? number(saldo) : null,
        errosTinyPOST: postErrors,
        errosTinyGET: getErrors,
      },
      descoberta: {
        idFornecidoManualmente: Boolean(requestedId),
        pesquisaPrimeiroProduto: discovery
          ? {
              status: discovery.status,
              ok: discovery.ok,
              idEncontrado: testId,
              tinyStatus: discovery.json?.retorno?.status ?? null,
              erros: tinyErrors(discovery.json),
            }
          : null,
        consultaProdutoPai: productDetails
          ? {
              status: productDetails.status,
              ok: productDetails.ok,
              tinyStatus: productDetails.json?.retorno?.status ?? null,
              erros: tinyErrors(productDetails.json),
            }
          : null,
      },
      postStock: {
        status: postStock.status,
        ok: postStock.ok,
        headers: postStock.headers,
        tinyStatus: postStock.json?.retorno?.status ?? null,
        codigoErro: postStock.json?.retorno?.codigo_erro ?? null,
        erros: postErrors,
        raw: postStock.raw,
      },
      getStock,
      observacao:
        "Este endpoint é somente diagnóstico: não usa Prisma e não cria/atualiza nenhum produto.",
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    )
  }
}
