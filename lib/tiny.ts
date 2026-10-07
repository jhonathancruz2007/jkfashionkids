const TINY_TOKEN = process.env.TINY_API_TOKEN

// Função para buscar o estoque atual de um produto no Tiny pelo SKU ou Código
async function consultarEstoqueTiny(sku: string) {
  if (!TINY_TOKEN) {
    console.warn('⚠️ Token do Tiny não configurado.')
    return null
  }

  try {
    // Endpoint de pesquisa de produtos da API V3 do Tiny
    const response = await fetch(`https://api.tiny.com.br/public-api/v3/produtos?pesquisa=${encodeURIComponent(sku)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TINY_TOKEN}`
      }
    })

    const data = await response.json()

    if (response.ok && data.itens && data.itens.length > 0) {
      // Retorna a quantidade em estoque encontrada no Tiny
      return data.itens[0].produto.saldoEstoque ?? 0
    }

    return null
  } catch (error) {
    console.error('❌ Erro ao consultar estoque no Tiny:', error)
    return null
  }
}

export { consultarEstoqueTiny }
