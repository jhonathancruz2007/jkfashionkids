import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Variável TINY_API_TOKEN não encontrada." }, { status: 500 });
  }

  try {
    // Usando a API V2 do Tiny com o token clássico
    const urlTiny = `https://api.tiny.com.br/api2/produtos.pesquisa.php?token=${TINY_TOKEN.trim()}&formato=json`;

    const response = await fetch(urlTiny, {
      method: "GET",
    });

    const textResponse = await response.text();

    if (!response.ok) {
      return NextResponse.json({ 
        error: "Erro na comunicação com o Tiny (V2).",
        statusHttp: response.status,
        respostaBruta: textResponse 
      }, { status: 400 });
    }

    let data;
    try {
      data = JSON.parse(textResponse);
    } catch (e) {
      return NextResponse.json({ 
        error: "O Tiny não retornou um JSON válido.", 
        recebido: textResponse 
      }, { status: 400 });
    }

    // Valida o retorno da API V2 do Tiny
    const retorno = data.retorno;
    if (!retorno || retorno.status !== "OK") {
      return NextResponse.json({ 
        error: "O Tiny retornou um erro na pesquisa de produtos.", 
        detalhes: retorno 
      }, { status: 400 });
    }

    const produtosEncontrados = retorno.produtos || [];
    let importados = 0;

    for (const item of produtosEncontrados) {
      const p = item.produto;
      if (!p || !p.id) continue;

      const produtoIdTiny = String(p.id);
      const nomeProduto = p.nome || "Produto sem nome";
      const precoProduto = Number(p.preco) || 0;
      const estoqueProduto = Number(p.saldo ?? 0);
      const skuProduto = p.sku || produtoIdTiny;

      // Na API V2 de pesquisa básica, a descrição completa e imagens adicionais 
      // podem vir detalhadas ao consultar o produto individualmente, mas salvamos a base agora:
      await db.produto.upsert({
        where: { id: produtoIdTiny },
        update: {
          nome: nomeProduto,
          preco: precoProduto,
          estoque: estoqueProduto,
          imagemUrl: p.anexo?p.anexo[0]: "https://via.placeholder.com/300",
        },
        create: {
          id: produtoIdTiny,
          nome: nomeProduto,
          descricao: nomeProduto, // Descrição padrão inicial caso venha vazia
          preco: precoProduto,
          estoque: estoqueProduto,
          imagemUrl: "https://via.placeholder.com/300",
          imagens: [],
          ativo: true,
        }
      });

      importados++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `${importados} produtos foram sincronizados com sucesso do Tiny para o seu site!` 
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: "Erro interno no servidor ao sincronizar produtos", 
      details: error.message 
    }, { status: 500 });
  }
}
