import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(req: Request) {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json(
      { error: "Variável TINY_API_TOKEN não encontrada no .env" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tipo = body.tipo || "geral";

    let pagina = 1;
    let continuarBuscando = true;
    const produtosEncontrados: any[] = [];

    // 1. Busca os produtos no Tiny usando os parâmetros exatos da API v2
    while (continuarBuscando && pagina <= 10) {
      const params = new URLSearchParams({
        token: TINY_TOKEN.trim(),
        pesquisa: "", // Obrigatorio para a rota produtos.pesquisa.php
        pagina: String(pagina),
        formato: "JSON",
      });

      const response = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Tiny API respondeu com HTTP ${response.status}`);
      }

      const data = await response.json();
      const retorno = data?.retorno;

      // Status 20 no Tiny indica "A Consulta não retornou registros"
      if (!retorno || retorno.status === "Erro") {
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

    if (produtosEncontrados.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhum produto foi encontrado no Tiny.",
      });
    }

    // 2. Mapeamento e agrupamento das variações
    const produtosAgrupados: { [key: string]: any } = {};

    for (const item of produtosEncontrados) {
      const p = item.produto;
      if (!p || !p.nome) continue;

      const saldoReal = Number(p.saldo ?? p.estoque ?? 0);
      const nomeCompleto = p.nome.trim();
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
        const estoqueAtual = produtosAgrupados[nomeBase].tamanhosMap.get(tamanhoEncontrado) || 0;
        produtosAgrupados[nomeBase].tamanhosMap.set(tamanhoEncontrado, estoqueAtual + saldoReal);
      }

      if (corEncontrada) {
        produtosAgrupados[nomeBase].cores.add(corEncontrada);
      }
    }

    // 3. Atualização no banco via Prisma
    let alterados = 0;

    for (const prod of Object.values(produtosAgrupados)) {
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
      estoque: `Estoque de ${alterados} produtos atualizado!`,
      novos_produtos: `${alterados} novos produtos importados!`,
      geral: `Sincronização concluída! ${alterados} produtos processados.`,
    };

    return NextResponse.json({
      success: true,
      message: mensagens[tipo] || mensagens.geral,
    });
  } catch (error: any) {
    console.error("Erro na sincronização:", error);
    return NextResponse.json(
      { error: "Erro na sincronização", details: error.message },
      { status: 500 }
    );
  }
}
