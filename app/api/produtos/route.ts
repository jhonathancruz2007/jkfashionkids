import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// Evita gerar esta API como uma página ISR durante o build. O catálogo
// contém imagens que historicamente foram armazenadas como data URLs/Base64.
export const dynamic = "force-dynamic";

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

function imagemPublica(id: string, imagem: string | null | undefined, indice: number): string {
  const valor = typeof imagem === "string" ? imagem.trim() : "";
  if (!valor) return "";

  // URLs normais continuam diretas. Base64 fica fora do JSON do catálogo
  // e é entregue sob demanda pela rota /api/produtos/[id]/imagem.
  if (/^data:image\//i.test(valor)) {
    return `/api/produtos/${encodeURIComponent(id)}/imagem?index=${indice}`;
  }

  return valor;
}

// Lista pública otimizada: as galerias completas ficam no endpoint de um
// único produto. Aqui enviamos somente as 2 imagens necessárias para os cards.
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

    const resultado = produtos.map((produto) => {
      const galeria = Array.isArray(produto.imagens) ? produto.imagens : [];
      const principalOriginal = galeria[0] || produto.imagemUrl || "";
      const segundaOriginal = galeria[1] || "";
      const principal = imagemPublica(produto.id, principalOriginal, 0);
      const segunda = imagemPublica(produto.id, segundaOriginal, 1);

      return {
        ...produto,
        // Não serializar as imagens Base64 completas nem duplicar a imagem
        // principal em `imagem`. Isso reduz drasticamente o corpo da resposta.
        imagemUrl: principal || imagemPublica(produto.id, produto.imagemUrl, 0),
        imagem: principal || imagemPublica(produto.id, produto.imagemUrl, 0),
        imagens: segunda ? [principal, segunda].filter(Boolean) : principal ? [principal] : [],
        categoria: produto.categoriaNome
          ? { nome: produto.categoriaNome }
          : null,
      };
    });

    return NextResponse.json(resultado, {
      status: 200,
      headers: {
        // Cache curto no edge sem transformar a rota em ISR durante o build.
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30",
      },
    });
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
