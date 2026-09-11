import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Variável TINY_API_TOKEN não encontrada." }, { status: 500 });
  }

  try {
    const urlTiny = `https://api.tiny.com.br/api2/produtos.pesquisa.php?token=${TINY_TOKEN.trim()}&formato=json`;

    const response = await fetch(urlTiny, { method: "GET" });
    const textResponse = await response.text();

    let data;
    try {
      data = JSON.parse(textResponse);
    } catch (e) {
      return NextResponse.json({ error: "Erro ao interpretar JSON do Tiny.", recebido: textResponse }, { status: 400 });
    }

    const retorno = data.retorno;
    if (!retorno || retorno.status !== "OK") {
      return NextResponse.json({ error: "Erro na pesquisa de produtos do Tiny.", detalhes: retorno }, { status: 400 });
    }

    const produtosEncontrados = retorno.produtos || [];
    
    // Objeto para agrupar produtos pelo nome base
    const produtosAgrupados: { [key: string]: any } = {};

    for (const item of produtosEncontrados) {
      const p = item.produto;
      if (!p || !p.nome) continue;

      let nomeCompleto = p.nome.trim();
      
      // Declaração corrigida com const
      const parts = nomeCompleto.split(" - ");
      
      let nomeBase = nomeCompleto;
      let tamanhoEncontrado = null;
      let corEncontrada = null;

      if (parts.length >= 3) {
        corEncontrada = parts[parts.length - 1].trim();
        tamanhoEncontrado = parts[parts.length - 2].trim();
        nomeBase = parts.slice(0, parts.length - 2).join(" - ").trim();
      } else if (parts.length === 2) {
        tamanhoEncontrado = parts[1].trim();
        nomeBase = parts[0].trim();
      }

      const preco = Number(p.preco) || 0;
      const estoque = Number(p.saldo || 0);

      if (!produtosAgrupados[nomeBase]) {
        produtosAgrupados[nomeBase] = {
          id: String(p.id),
          nome: nomeBase,
          descricao: nomeBase,
          preco: preco,
          estoqueTotal: 0,
          tamanhos: new Set<string>(),
          cores: new Set<string>(),
          imagemUrl: "https://via.placeholder.com/300"
        };
      }

      produtosAgrupados[nomeBase].estoqueTotal += estoque;

      if (tamanhoEncontrado) {
        produtosAgrupados[nomeBase].tamanhos.add(tamanhoEncontrado);
      }
      if (corEncontrada) {
        produtosAgrupados[nomeBase].cores.add(corEncontrada);
      }
    }

    let importados = 0;

    for (const [nomeBase, prod] of Object.entries(produtosAgrupados)) {
      const arrayTamanhos = Array.from(prod.tamanhos);
      const arrayCores = Array.from(prod.cores);

      await db.produto.upsert({
        where: { id: prod.id },
        update: {
          nome: prod.nome,
          preco: prod.preco,
          estoque: prod.estoqueTotal,
          tamanhos: arrayTamanhos,
          cores: arrayCores,
        },
        create: {
          id: prod.id,
          nome: prod.nome,
          descricao: prod.descricao,
          preco: prod.preco,
          estoque: prod.estoqueTotal,
          tamanhos: arrayTamanhos,
          cores: arrayCores,
          imagemUrl: prod.imagemUrl,
          imagens: [],
          ativo: true,
        }
      });

      importados++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `${importados} produtos únicos foram agrupados e sincronizados com sucesso!` 
    });

  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno ao processar agrupamento", details: error.message }, { status: 500 });
  }
}
