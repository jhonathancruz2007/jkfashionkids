import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Variável TINY_API_TOKEN não encontrada." }, { status: 500 });
  }

  try {
    let pagina = 1;
    let continuarBuscando = true;
    const produtosEncontrados: any[] = [];

    while (continuarBuscando && pagina <= 20) {
      const urlTiny = `https://api.tiny.com.br/api2/produtos.pesquisa.php?token=${TINY_TOKEN.trim()}&pagina=${pagina}&formato=json`;

      const response = await fetch(urlTiny, { method: "GET" });
      const textResponse = await response.text();

      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        break;
      }

      const retorno = data.retorno;
      if (!retorno || retorno.status !== "OK") {
        break;
      }

      const lista = retorno.produtos || [];
      if (lista.length === 0) {
        continuarBuscando = false;
      } else {
        produtosEncontrados.push(...lista);
        if (lista.length < 50) {
          continuarBuscando = false;
        } else {
          pagina++;
        }
      }
    }

    const produtosAgrupados: { [key: string]: any } = {};

    for (const item of produtosEncontrados) {
      const p = item.produto;
      if (!p || !p.nome) continue;

      let nomeCompleto = p.nome.trim();
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
      // Garante que pega o saldo, estoque ou o valor numérico disponível
      const estoqueItem = Number(p.saldo ?? p.estoque ?? 0);

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

      // Soma o estoque de todas as variações daquele produto base
      produtosAgrupados[nomeBase].estoqueTotal += estoqueItem;

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
          estoque: prod.estoqueTotal, // Atualiza com o estoque somado das variações
          tamanhos: arrayTamanhos,
          cores: arrayCores,
        },
        create: {
          id: prod.id,
          nome: prod.nome,
          descricao: prod.descricao,
          preco: prod.preco,
          estoque: prod.estoqueTotal, // Cria com o estoque somado das variações
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
      message: `Sincronização e estoque atualizados com sucesso! ${importados} produtos únicos sincronizados.` 
    });

  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno ao processar estoque", details: error.message }, { status: 500 });
  }
}
