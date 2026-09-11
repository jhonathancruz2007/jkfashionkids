import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Token do Tiny não configurado nas variáveis de ambiente" }, { status: 500 });
  }

  try {
    // 1. Faz a requisição para a API V3 do Tiny (adicionando paginação básica se necessário)
    const response = await fetch("https://api.tiny.com.br/public-api/v3/produtos?pagina=1", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TINY_TOKEN}`,
        "Accept": "application/json"
      }
    });

    const textResponse = await response.text();
    
    // Se a resposta estiver vazia
    if (!textResponse) {
      return NextResponse.json({ 
        error: "A API do Tiny retornou uma resposta vazia.", 
        statusTiny: response.status 
      }, { status: 400 });
    }

    let data;
    try {
      data = JSON.parse(textResponse);
    } catch (e) {
      return NextResponse.json({ 
        error: "A resposta do Tiny não é um JSON válido.", 
        respostaRecebida: textResponse.substring(0, 200) 
      }, { status: 400 });
    }

    if (!response.ok || (!data.itens && !Array.isArray(data))) {
      return NextResponse.json({ 
        error: "Erro retornado pela API do Tiny", 
        details: data 
      }, { status: 400 });
    }

    // Normaliza a lista de produtos dependendo de como o Tiny retorna (data.itens ou direto um array)
    const listaProdutos = data.itens || (Array.isArray(data) ? data : []);

    let importados = 0;

    for (const item of listaProdutos) {
      // Ajusta caso o objeto venha encapsulado em .produto ou direto no item
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
      message: `${importados} produtos do Tiny foram sincronizados com sucesso para o seu site!` 
    });

  } catch (error: any) {
    console.error("Erro crítico na sincronização:", error);
    return NextResponse.json({ 
      error: "Erro interno ao processar a sincronização", 
      message: error.message 
    }, { status: 500 });
  }
}
