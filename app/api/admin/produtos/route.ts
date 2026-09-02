import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Ordem customizada de tamanhos
const ORDEM_TAMANHOS = [
  'RN', 'P', 'M', 'G', 'GG', 
  '1', '2', '3', '4', '6', '8', '10', '12', '14', '16',
  'ÚNICO', 'UNICO'
]

// Função para tratar e ordenar os tamanhos
function processarTamanhos(tamanhosInput: any): string[] {
  if (!Array.isArray(tamanhosInput)) {
    return ['Único']
  }

  const filtrados = tamanhosInput
    .map((t: any) => String(t).trim())
    .filter((t: string) => t !== '')

  if (filtrados.length === 0) {
    return ['Único']
  }

  return [...filtrados].sort((a, b) => {
    const idxA = ORDEM_TAMANHOS.indexOf(a.toUpperCase())
    const idxB = ORDEM_TAMANHOS.indexOf(b.toUpperCase())

    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

// GET: Listar todos os produtos
export async function GET() {
  try {
    const produtos = await prisma.produto.findMany({
      include: {
        categoria: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })
    return NextResponse.json(produtos)
  } catch (error) {
    console.error("Erro ao buscar produtos:", error)
    return NextResponse.json(
      { error: "Erro interno ao buscar produtos." },
      { status: 500 }
    )
  }
}

// POST: Cadastrar novo produto
export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log("📦 DADOS RECEBIDOS NA API:", body)

    const {
      nome,
      descricao,
      preco,
      precoPromocional,
      imagemUrl,
      imagens,
      estoque,
      tamanhos,
      estoquePorTamanho,
      genero,
      faixaEtaria,
      ativo,
      localCard,
      categoriaId,
    } = body

    // Validações individuais
    if (!nome || typeof nome !== "string" || nome.trim() === "") {
      return NextResponse.json({ error: "O campo Nome é obrigatório e não pode estar vazio." }, { status: 400 })
    }
    
    if (!descricao || typeof descricao !== "string" || descricao.trim() === "") {
      return NextResponse.json({ error: "O campo Descrição é obrigatório e não pode estar vazio." }, { status: 400 })
    }

    if (preco === undefined || preco === null || preco === "" || isNaN(Number(preco))) {
      return NextResponse.json({ error: "O campo Preço é obrigatório e deve ser um número válido." }, { status: 400 })
    }

    if (!imagemUrl || typeof imagemUrl !== "string" || imagemUrl.trim() === "") {
      return NextResponse.json({ error: "A imagem principal do produto é obrigatória. Adicione ou selecione uma foto." }, { status: 400 })
    }

    // Tratamento de tamanhos e estoque por variação
    const tamanhosOrdenados = processarTamanhos(tamanhos)
    const estoqueTotalNum = parseInt(estoque) || 0

    let estoquePorTamanhoFinal = estoquePorTamanho

    // Se ficou como tamanho "Único" e o estoque por tamanho não foi informado, preenche automaticamente
    if (
      tamanhosOrdenados.length === 1 && 
      tamanhosOrdenados[0] === 'Único' && 
      (!estoquePorTamanhoFinal || Object.keys(estoquePorTamanhoFinal).length === 0)
    ) {
      estoquePorTamanhoFinal = { 'Único': estoqueTotalNum }
    }

    // RESOLUÇÃO DA CATEGORIA
    let categoriaUUIDReal: string | null = null;

    if (categoriaId && typeof categoriaId === "string" && categoriaId.trim() !== "") {
      const valorBusca = categoriaId.trim();

      // Validação do formato UUID
      const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valorBusca);

      // Monta as condições dinamicamente
      const condicoesOR: any[] = [
        { nome: { equals: valorBusca, mode: "insensitive" } }
      ];

      // Inclui a consulta por `id` apenas se a string for um UUID válido
      if (isUUID) {
        condicoesOR.push({ id: valorBusca });
      }

      let categoriaEncontrada = await prisma.categoria.findFirst({
        where: {
          OR: condicoesOR
        }
      });

      if (!categoriaEncontrada) {
        const nomeFormatado = valorBusca
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/(^\w|\s\w)/g, (l) => l.toUpperCase());

        try {
          categoriaEncontrada = await prisma.categoria.create({
            data: {
              nome: nomeFormatado,
            }
          });
        } catch (err) {
          categoriaEncontrada = await prisma.categoria.findFirst({
            where: { nome: { equals: nomeFormatado, mode: "insensitive" } }
          });
        }
      }

      if (categoriaEncontrada) {
        categoriaUUIDReal = categoriaEncontrada.id;
      }
    }

    // Criação do produto no banco de dados
    const novoProduto = await prisma.produto.create({
      data: {
        nome: nome.trim(),
        descricao: descricao.trim(),
        preco: parseFloat(preco),
        precoPromocional: precoPromocional ? parseFloat(precoPromocional) : null,
        imagemUrl: imagemUrl.trim(),
        imagens: Array.isArray(imagens) ? imagens : [],
        estoque: estoqueTotalNum,
        tamanhos: tamanhosOrdenados,
        estoquePorTamanho: estoquePorTamanhoFinal ?? null,
        genero: genero || "masculino",
        faixaEtaria: faixaEtaria || "INFANTIL",
        ativo: ativo !== undefined ? Boolean(ativo) : true,
        localCard: localCard || "HOME_DESTAQUE",
        categoriaId: categoriaUUIDReal,
      },
      include: {
        categoria: true,
      },
    })

    return NextResponse.json(novoProduto, { status: 201 })
  } catch (error: any) {
    console.error("Erro detalhado ao cadastrar produto:", error)
    
    return NextResponse.json(
      { error: `Erro no Banco de Dados: ${error.message || error}` },
      { status: 500 }
    )
  }
}