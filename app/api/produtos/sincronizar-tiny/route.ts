import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Variável TINY_API_TOKEN não encontrada no ambiente da Vercel." }, { status: 500 });
  }

  try {
    // Tentativa na API V3 do Tiny
    const response = await fetch("https://api.tiny.com.br/public-api/v3/produtos?pagina=1", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TINY_TOKEN.trim()}`,
        "Accept": "application/json"
      }
    });

    const textResponse = await response.text();

    // Se a API recusar (401), retornamos o texto bruto que o Tiny mandou para entendermos o motivo
    if (!response.ok) {
      return NextResponse.json({ 
        error: "O Tiny recusou o token (Erro 401).",
        statusHttp: response.status,
        respostaBrutaDoTiny: textResponse || "Nenhuma resposta retornada pelo servidor do Tiny"
      }, { status: 401 });
    }

    let data;
    try {
      data = JSON.parse(textResponse);
    } catch (e) {
      return NextResponse.json({ 
        error: "O Tiny retornou um formato que não é JSON.", 
        recebido: textResponse 
      }, { status: 400 });
    }

    const listaProdutos = data.itens || (Array.isArray(data) ? data : []);
    let importados = 0;

    for (const item of listaProdutos) {
      const p = item.produto || item;
      const skuOuId = String(p.sku || p.id || "");
      if (!skuOuId) continue;

      const nomeProduto = p.nome || "Produto sem nome";
      const precoProduto = Number(p.preco) || 0;
      const estoqueProduto = Number(p.saldoEstoque ?? p.estoque ?? 0);
      const descricaoProduto = p.descricao || "Sem descrição";
      
      const imagemPrincipal = (p.anexos && p.anexos.length > 0 ? p.anexos[0].url : null) || p.imagem || "https://via.placeholder.com/300";
      const todasImagens = p.anexos ? p.anexos.map((a: any) => a.url) : [];

      let categoriaNomeVinculada = null;
      if (p.categoria) {
        categoriaNomeVinculada = String(typeof p.categoria === 'object' ? p.categoria.nome : p.categoria).trim();
        await db.categoria.upsert({
          where: { nome: categoriaNomeVinculada },
          update: {},
          create: { nome: categoriaNomeVinculada }
        }).catch(() => null);
      }

      const produtoIdTiny = String(p.id || skuOuId);

      await db.produto.upsert({
        where: { id: produtoIdTiny },
        update: {
          nome: nomeProduto,
          preco: precoProduto,
          estoque: estoqueProduto,
          descricao: descricaoProduto,
          imagemUrl: imagemPrincipal,
          imagens: todasImagens,
          ...(categoriaNomeVinculada ? { categoriaNome: categoriaNomeVinculada } : {})
        },
        create: {
          id: produtoIdTiny,
          nome: nomeProduto,
          preco: precoProduto,
          estoque: estoqueProduto,
          descricao: descricaoProduto,
          imagemUrl: imagemPrincipal,
          imagens: todasImagens,
          ativo: true,
          ...(categoriaNomeVinculada ? { categoriaNome: categoriaNomeVinculada } : {})
        }
      });

      importados++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `${importados} produtos sincronizados com sucesso!` 
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: "Erro interno no servidor ao chamar o Tiny", 
      details: error.message 
    }, { status: 500 });
  }
}
