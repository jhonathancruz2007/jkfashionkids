import { NextResponse } from "next/server";
import { db } from "@/lib/db"; // Ajuste conforme o caminho do seu Prisma/Banco

export async function GET() {
  const TINY_TOKEN = process.env.TINY_API_TOKEN;

  if (!TINY_TOKEN) {
    return NextResponse.json({ error: "Token do Tiny não configurado" }, { status: 500 });
  }

  try {
    // 1. Busca os produtos cadastrados na API V3 do Tiny
    const response = await fetch("https://api.tiny.com.br/public-api/v3/produtos", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TINY_TOKEN}`
      }
    });

    const data = await response.json();

    if (!response.ok || !data.itens) {
      return NextResponse.json({ error: "Erro ao buscar produtos no Tiny", details: data }, { status: 400 });
    }

    let importados = 0;

    // 2. Varre cada produto retornado pelo Tiny e salva no banco do site
    for (const item of data.itens) {
      const p = item.produto;
      
      // Mapeie os campos de acordo com a estrutura do seu banco de dados Prisma
      await db.produto.upsert({
        where: { sku: p.sku || String(p.id) },
        update: {
          nome: p.nome,
          preco: Number(p.preco) || 0,
          estoque: Number(p.saldoEstoque) || 0,
        },
        create: {
          sku: p.sku || String(p.id),
          nome: p.nome,
          preco: Number(p.preco) || 0,
          estoque: Number(p.saldoEstoque) || 0,
          descricao: p.descricao || "",
        }
      });

      importados++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `${importados} produtos sincronizados com sucesso do Tiny!` 
    });

  } catch (error: any) {
    console.error("Erro na sincronização:", error);
    return NextResponse.json({ error: "Erro interno ao sincronizar produtos", message: error.message }, { status: 500 });
  }
}
