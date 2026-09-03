import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getClienteLogado() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("cliente_token")?.value;
    if (!token) return null;

    const tokenLimpio = token.trim();

    if (tokenLimpio.includes("@")) {
      return await prisma.cliente.findUnique({
        where: { email: tokenLimpio },
      });
    }

    return await prisma.cliente.findUnique({
      where: { id: tokenLimpio },
    });
  } catch (error) {
    console.error("Erro ao identificar cliente logado:", error);
    return null;
  }
}

function parseProdutoId(id: any): string | null {
  if (!id) return null;
  const strId = String(id).trim();
  return strId.length > 0 ? strId : null;
}

// 🟢 GET: Retorna os favoritos do cliente
export async function GET() {
  try {
    const cliente = await getClienteLogado();
    if (!cliente) {
      return NextResponse.json({ favoritos: [] });
    }

    const favoritos = await prisma.favorito.findMany({
      where: { clienteId: cliente.id },
      include: {
        produto: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ favoritos });
  } catch (error: any) {
    console.error("Erro no GET /favoritos:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao carregar favoritos." },
      { status: 500 }
    );
  }
}

// 🟢 POST: Alterna (Toggle) ou adiciona favorito
export async function POST(req: Request) {
  try {
    const cliente = await getClienteLogado();
    if (!cliente) {
      return NextResponse.json(
        { error: "Você precisa estar logado para favoritar." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawProdutoId = body.produtoId ?? body.id;
    const produtoId = parseProdutoId(rawProdutoId);

    if (!produtoId) {
      return NextResponse.json(
        { error: "ID do produto inválido ou não fornecido." },
        { status: 400 }
      );
    }

    // Garante que o produto existe na tabela Produto
    const produtoExiste = await prisma.produto.findUnique({
      where: { id: produtoId },
    });

    if (!produtoExiste) {
      return NextResponse.json(
        { error: "Produto não encontrado no catálogo." },
        { status: 404 }
      );
    }

    const favoritoExistente = await prisma.favorito.findUnique({
      where: {
        clienteId_produtoId: {
          clienteId: cliente.id,
          produtoId: produtoId,
        },
      },
    });

    if (favoritoExistente) {
      await prisma.favorito.delete({
        where: { id: favoritoExistente.id },
      });
      return NextResponse.json({ favoritado: false, produtoId });
    } else {
      const novoFavorito = await prisma.favorito.create({
        data: {
          clienteId: cliente.id,
          produtoId: produtoId,
        },
        include: {
          produto: true,
        },
      });
      return NextResponse.json({
        favoritado: true,
        favorito: novoFavorito,
        produtoId,
      });
    }
  } catch (error: any) {
    console.error("Erro no POST /favoritos:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

// 🔴 DELETE: Aceita produtoId tanto pelo Body quanto por Query String
export async function DELETE(req: Request) {
  try {
    const cliente = await getClienteLogado();
    if (!cliente) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    // Tenta ler primeiro do Body da requisição (usado pelo contexto)
    let rawProdutoId: any = null;
    try {
      const body = await req.json();
      rawProdutoId = body?.produtoId ?? body?.id;
    } catch {
      // Se não houver body JSON, tenta ler das query params
      const { searchParams } = new URL(req.url);
      rawProdutoId = searchParams.get("produtoId") || searchParams.get("id");
    }

    const produtoId = parseProdutoId(rawProdutoId);

    if (!produtoId) {
      return NextResponse.json(
        { error: "ID do produto inválido ou não fornecido." },
        { status: 400 }
      );
    }

    await prisma.favorito.deleteMany({
      where: {
        clienteId: cliente.id,
        produtoId: produtoId,
      },
    });

    return NextResponse.json({ favoritado: false, produtoId });
  } catch (error: any) {
    console.error("Erro no DELETE /favoritos:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao remover favorito." },
      { status: 500 }
    );
  }
}
