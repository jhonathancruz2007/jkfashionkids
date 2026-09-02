import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Ordem customizada de tamanhos
const ORDEM_TAMANHOS = [
  'RN', 'P', 'M', 'G', 'GG', 
  '1', '2', '3', '4', '6', '8', '10', '12', '14', '16',
  'ÚNICO', 'UNICO'
]

// Função para ordenar os tamanhos pela lista customizada
function ordenarTamanhos(tamanhos: string[]): string[] {
  return [...tamanhos].sort((a, b) => {
    const idxA = ORDEM_TAMANHOS.indexOf(a.trim().toUpperCase())
    const idxB = ORDEM_TAMANHOS.indexOf(b.trim().toUpperCase())

    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    }

    if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
      return NextResponse.json({ 
        error: 'Formato XLS/XLSX não suportado diretamente. Exporte e envie como CSV (separado por ponto e vírgula).' 
      }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/)

    if (lines.length <= 1) {
      return NextResponse.json({ error: 'O arquivo CSV está vazio ou inválido.' }, { status: 400 })
    }

    const headerLine = lines[0]
    const separator = headerLine.includes(';') ? ';' : ','

    const headers = headerLine.split(separator).map(h => 
      h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/["']/g, '')
    )

    console.log('🔍 CABEÇALHOS DETECTADOS NO CSV:', headers)

    const codigoIdx = headers.findIndex(h => h.includes('codigo') || h.includes('sku') || h.includes('id'))
    const nomeIdx = headers.findIndex(h => h.includes('nome') || (h.includes('descricao') && !h.includes('detalhe')))
    const descIdx = headers.findIndex(h => h.includes('detalhe') || h.includes('descricao') || h.includes('obs'))
    const precoIdx = headers.findIndex(h => h.includes('preco') && !h.includes('promocional'))
    const estoqueIdx = headers.findIndex(h => h.includes('estoque') || h.includes('saldo'))
    const imagemIdx = headers.findIndex(h => h.includes('imagem') || h.includes('foto') || h.includes('url') || h.includes('link'))
    const tamanhoIdx = headers.findIndex(h => h.includes('tamanho') || h.includes('tam') || h.includes('grade'))

    type ProdutoAgrupado = {
      codigoOriginal: string
      nomeBase: string
      descricao: string
      preco: number
      estoqueTotal: number
      imagemUrl: string
      tamanhos: Set<string>
      estoquePorTamanho: Record<string, number>
    }

    const mapaProdutos = new Map<string, ProdutoAgrupado>()

    // 1️⃣ Processamento e unificação dos itens do CSV na memória
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, '').replace(/\r$/, ''))

      const codigo = codigoIdx !== -1 && cols[codigoIdx] ? cols[codigoIdx] : null
      const nomeCompleto = nomeIdx !== -1 && cols[nomeIdx] ? cols[nomeIdx] : null

      if (!codigo || !nomeCompleto) continue

      let tamanho = tamanhoIdx !== -1 && cols[tamanhoIdx] ? cols[tamanhoIdx].trim() : ''
      let nomeBase = nomeCompleto

      // Extrai tamanho do nome se vier no padrão do ERP (ex: "PRODUTO - 14 - PRETO")
      if (!tamanho && nomeCompleto.includes('-')) {
        const partes = nomeCompleto.split('-').map(p => p.trim())
        if (partes.length >= 2) {
          nomeBase = partes[0]
          tamanho = partes[1]
        }
      }

      const descricao = descIdx !== -1 && cols[descIdx] ? cols[descIdx] : nomeBase
      const imagemUrl = imagemIdx !== -1 && cols[imagemIdx] ? cols[imagemIdx] : 'https://placehold.co/600x600?text=Sem+Foto'

      let precoStr = precoIdx !== -1 && cols[precoIdx] ? cols[precoIdx] : '0'
      precoStr = precoStr.replace('R$', '').trim().replace(/\./g, '').replace(',', '.')
      const preco = parseFloat(precoStr) || 0

      let estoqueStr = estoqueIdx !== -1 && cols[estoqueIdx] ? cols[estoqueIdx] : '0'
      const estoque = parseInt(estoqueStr, 10) || 0

      const chave = nomeBase.trim().toLowerCase()

      if (!mapaProdutos.has(chave)) {
        const estoquePorTam: Record<string, number> = {}
        if (tamanho) estoquePorTam[tamanho] = estoque

        mapaProdutos.set(chave, {
          codigoOriginal: codigo,
          nomeBase: nomeBase.trim(),
          descricao,
          preco,
          estoqueTotal: estoque,
          imagemUrl,
          tamanhos: new Set(tamanho ? [tamanho] : []),
          estoquePorTamanho: estoquePorTam
        })
      } else {
        const existente = mapaProdutos.get(chave)!
        existente.estoqueTotal += estoque
        if (tamanho) {
          existente.tamanhos.add(tamanho)
          existente.estoquePorTamanho[tamanho] = (existente.estoquePorTamanho[tamanho] || 0) + estoque
        }
        if (existente.imagemUrl.includes('placehold.co') && !imagemUrl.includes('placehold.co')) {
          existente.imagemUrl = imagemUrl
        }
      }
    }

    let importados = 0

    // 2️⃣ Persistência no Banco via Prisma com ordenação e fallback para "Único"
    for (const prod of mapaProdutos.values()) {
      let tamanhosNovos = Array.from(prod.tamanhos)

      // 💡 Fallback: Se não houver tamanho definido, atribui "Único" e relaciona todo o estoque
      if (tamanhosNovos.length === 0) {
        tamanhosNovos = ['Único']
        prod.estoquePorTamanho = { 'Único': prod.estoqueTotal }
      }

      const produtoExistente = await prisma.produto.findFirst({
        where: { nome: { equals: prod.nomeBase, mode: 'insensitive' } }
      })

      if (produtoExistente) {
        const tamanhosAntigos = Array.isArray(produtoExistente.tamanhos) ? produtoExistente.tamanhos : []
        let tamanhosUnificados = Array.from(new Set([...tamanhosAntigos, ...tamanhosNovos]))
        
        if (tamanhosUnificados.length === 0) {
          tamanhosUnificados = ['Único']
        }

        const estoquePorTamanhoAntigo = (produtoExistente.estoquePorTamanho as Record<string, number>) || {}
        const estoquePorTamanhoUnificado = { ...estoquePorTamanhoAntigo, ...prod.estoquePorTamanho }

        await prisma.produto.update({
          where: { id: produtoExistente.id },
          data: {
            preco: prod.preco || produtoExistente.preco,
            estoque: prod.estoqueTotal,
            imagemUrl: prod.imagemUrl.includes('placehold.co') ? produtoExistente.imagemUrl : prod.imagemUrl,
            tamanhos: ordenarTamanhos(tamanhosUnificados),
            estoquePorTamanho: estoquePorTamanhoUnificado,
          }
        })
      } else {
        await prisma.produto.create({
          data: {
            id: prod.codigoOriginal,
            nome: prod.nomeBase,
            descricao: prod.descricao,
            preco: prod.preco,
            estoque: prod.estoqueTotal,
            imagemUrl: prod.imagemUrl,
            tamanhos: ordenarTamanhos(tamanhosNovos),
            estoquePorTamanho: prod.estoquePorTamanho,
            ativo: true,
          }
        })
      }

      importados++
    }

    console.log(`✅ Importação concluída com sucesso: ${importados} produtos únicos salvos!`)
    return NextResponse.json({ 
      success: true, 
      message: `${importados} produtos unificados e salvos com sucesso!`,
      totalImportados: importados 
    }, { status: 200 })

  } catch (erro) {
    console.error('❌ ERRO CRÍTICO AO IMPORTAR:', erro)
    return NextResponse.json({ error: 'Erro ao processar o arquivo CSV.' }, { status: 500 })
  }
}