import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json(
      { error: "Variável TINY_API_TOKEN não encontrada." },
      { status: 500 }
    );
  }

  try {
    const { tipo } = await req.json(); // "estoque" | "novos_produtos" | "geral"

    let pagina = 1;
    let continuarBuscando = true;
    const produtosEncontrados: any[] = [];

    // 1. Busca os produtos no Tiny (Lista resumida)
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

    // 2. Mapeia estoques reais fazendo chamadas por ID
    // Obs: No Tiny API v2, a forma mais precisa de puxar o saldo é via produto.obter.estoque.php
    const produtosAgrupados: { [key: string]: any } = {};

    for (const item of produtosEncontrados) {
      const p = item.produto;
      if (!p || !p.nome) continue;

      // Puxa o saldo real de estoque do produto individual no Tiny
      let saldoReal = 0;
      try {
        const urlEstoque = `https://api.tiny.com.br/api2/produto.obter.estoque.php?token=${TINY_TOKEN.trim()}&id=${p.id}&formato=json`;
        const resEstoque = await fetch(urlEstoque);
        const dataEstoque = await resEstoque.json();

        if (dataEstoque?.retorno?.status === "OK") {
          saldoReal = Number(dataEstoque.retorno.produto.saldo) || 0;
        }
      } catch (err) {
        console.error(`Erro ao buscar estoque do produto ${p.id}:`, err);
      }

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

      if (!produtosAgrupados[nomeBase]) {
        produtosAgrupados[nomeBase] = {
          id: String(p.id),
          nome: nomeBase,
          descricao: nomeBase,
          preco: preco,
          estoqueTotal: 0,
          tamanhosMap: new Map<string, number>(),
          cores: new Set<string>(),
          imagemUrl: "https://via.placeholder.com/300",
        };
      }

      produtosAgrupados[nomeBase].estoqueTotal += saldoReal;

      if (tamanhoEncontrado) {
        const estoqueAtualTamanho =
          produtosAgrupados[nomeBase].tamanhosMap.get(tamanhoEncontrado) || 0;
        produtosAgrupados[nomeBase].tamanhosMap.set(
          tamanhoEncontrado,
          estoqueAtualTamanho + saldoReal
        );
      }

      if (corEncontrada) {
        produtosAgrupados[nomeBase].cores.add(corEncontrada);
      }
    }

    let alterados = 0;

    // 3. Atualização no banco de dados via Prisma
    for (const [nomeBase, prod] of Object.entries(produtosAgrupados)) {
      const arrayTamanhos = Array.from(prod.tamanhosMap.entries()).map(
        ([tam, qtd]) => `${tam}: ${qtd}`
      );
      const arrayCores = Array.from(prod.cores);

      const produtoExistente = await prisma.produto.findUnique({
        where: { id: prod.id },
      });

      if (tipo === "estoque") {
        if (produtoExistente) {
          await prisma.produto.update({
            where: { id: prod.id },
            data: {
              estoque: prod.estoqueTotal,
              tamanhos: arrayTamanhos,
            },
          });
          alterados++;
        }
      } else if (tipo === "novos_produtos") {
        if (!produtoExistente) {
          await prisma.produto.create({
            data: {
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
            },
          });
          alterados++;
        }
      } else {
        await prisma.produto.upsert({
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
          },
        });
        alterados++;
      }
    }

    const mensagens: Record<string, string> = {
      estoque: `Estoque de ${alterados} produtos atualizado com sucesso!`,
      novos_produtos: `${alterados} novos produtos importados do Tiny!`,
      geral: `Sincronização geral concluída! ${alterados} produtos sincronizados.`,
    };

    return NextResponse.json({
      success: true,
      message: mensagens[tipo] || mensagens.geral,
    });
  } catch (error: any) {
    console.error("Erro na sincronização:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar sincronização", details: error.message },
      { status: 500 }
    );
  }
}
