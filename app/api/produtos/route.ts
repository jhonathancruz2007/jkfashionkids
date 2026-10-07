import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const revalidate = 5;

type ProdutoCatalogo = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  precoPromocional: number | null;
  imagemUrl: string;
  imagens: string[];
  estoque: number;
  tamanhos: string[];
  estoquePorTamanho: unknown;
  cores: string[];
  estoquePorCor: unknown;
  genero: string | null;
  faixaEtaria: string | null;
  estacao: string | null;
  ativo: boolean;
  localCard: string | null;
  categoriaNome: string | null;
  createdAt: Date;
};

// A listagem pública usa SQL direto para não depender de campos
// divergentes do schema/migration history local.
export async function GET() {
  try {
    const produtos = await prisma.$queryRaw<ProdutoCatalogo[]>`
      SELECT
        "id",
        "nome",
        "descricao",
        "preco",
        "precoPromocional",
        "imagemUrl",
        "imagens",
        "estoque",
        "tamanhos",
        "estoquePorTamanho",
        "cores",
        "estoquePorCor",
        "genero",
        "faixaEtaria",
        "estacao",
        "ativo",
        "localCard",
        "categoriaNome",
        "createdAt"
      FROM "Produto"
      WHERE "ativo" = true
      ORDER BY "createdAt" DESC
    `;

    return NextResponse.json(
      produtos.map((produto) => ({
        ...produto,
        imagem: produto.imagemUrl,
        categoria: produto.categoriaNome
          ? { nome: produto.categoriaNome }
          : null,
      })),
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30",
        },
      }
    );
  } catch (error: any) {
    console.error("🔥 ERRO AO CARREGAR CATÁLOGO:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar produtos do catálogo",
        detalhe: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
