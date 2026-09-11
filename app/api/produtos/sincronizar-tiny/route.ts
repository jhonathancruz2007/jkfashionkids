import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Token do Tiny não configurado nas variáveis de ambiente" }, { status: 500 });
  }

  try {
    // 1. Busca os produtos cadastrados na API V3 do Tiny
    const response = await fetch("https://api.tiny.com.br/public-api/v3/produtos", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TINY_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok || !data.itens) {
      return NextResponse.json({ 
        error: "Erro ao buscar produtos na API do Tiny", 
        details: data 
      }, { status: 400 });
    }

    let importados = 0;

    // 2. Varre cada item retornado pelo Tiny e salva/atualiza no banco via Prisma
    for (const item of data.itens) {
      const p = item.produto;
      
      const skuOuId = String(p.sku || p.id || "");
      if (!skuOuId) continue;

      const nomeProduto = p.nome || "Produto sem nome";
      const precoProduto = Number(p.preco) || 0;
      const estoqueProduto = Number(p.saldoEstoque) || 0;
      const descricaoProduto = p.descricao || "Sem descrição";
      
      // Imagens
      const imagemPrincipal = p.anexos && p.anexos.length > 0 ? p.anexos[0].url : (p.imagem || "");
      const todasImagens = p.anexos ? p.anexos.map((a: any) => a.url) : [];

      // Tratamento de Categoria (se houver no Tiny, garante que ela existe no banco para evitar erro de FK)
      let categoriaNomeVinculada = null;
      if (p.categoria) {
        categoriaNomeVinculada = String(p.categoria).trim();
        await db.categoria.upsert({
          where: { nome: categoriaNomeVinculada },
          update: {},
          create: { nome: categoriaNomeVinculada }
        }).catch(() => null);
      }

      // Como o Prisma não possui um campo 'sku' nativo no seu modelo atual mas tem o 'id' como UUID,
      // vamos usar o 'id' do Tiny (ou SKU) para identificar o produto de forma única, ou buscar pelo nome/id.
      // Se preferir salvar o id do Tiny como id do produto no banco:
      const produtoIdTiny = String(p.id || skuOuId);

      await db.produto.upsert({
        where: { id: produtoIdTiny },
        update: {
          nome: nomeProduto,
          preco: precoProduto,
          estoque: estoqueProduto,
          descricao: descricaoProduto,
          imagemUrl: imagemPrincipal || "https://via.placeholder.com/300",
          imagens: todasImagens,
          ...(categoriaNomeVinculada ? { categoriaNome: categoriaNomeVinculada } : {})
        },
        create: {
          id: produtoIdTiny,
          nome: nomeProduto,
          preco: precoProduto,
          estoque: estoqueProduto,
          descricao: descricaoProduto,
          imagemUrl: imagemPrincipal || "https://via.placeholder.com/300",
          imagens: todasImagens,
          ativo: true,
          ...(categoriaNomeVinculada ? { categoriaNome: categoriaNomeVinculada } : {})
        }
      });

      importados++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `${importados} produtos do Tiny foram sincronizados com sucesso para o seu site!` 
    });

  } catch (error: any) {
    console.error("Erro crítico na sincronização com o Tiny:", error);
    return NextResponse.json({ 
      error: "Erro interno ao processar a sincronização", 
      message: error.message 
    }, { status: 500 });
  }
}
