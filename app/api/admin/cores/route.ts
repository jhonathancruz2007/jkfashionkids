const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. ROTA GET: Lista todas as cores cadastradas
// ==========================================
router.get('/api/admin/cores', async (req, res) => {
  try {
    const cores = await prisma.cor.findMany({ 
      orderBy: { createdAt: 'desc' } 
    });
    return res.status(200).json(cores);
  } catch (erro) {
    console.error("Erro ao buscar cores:", erro);
    return res.status(500).json({ sucesso: false, mensagem: "Erro ao buscar cores." });
  }
});

// ==========================================
// 2. ROTA POST: Adiciona a cor vinculada ao tamanho e estoque do produto
// ==========================================
router.post('/api/admin/cores', async (req, res) => {
  // Exibe o que o front-end está enviando no body para conferirmos
  console.log("Dados recebidos no body para salvar cor/tamanho:", req.body);

  const { produtoId, tamanho, cor, hex, estoque } = req.body;

  if (!produtoId || !tamanho || !cor) {
    return res.status(400).json({ 
      sucesso: false, 
      mensagem: "O ID do produto, o tamanho e o nome da cor são obrigatórios no corpo da requisição." 
    });
  }

  const quantidadeEstoque = Number(estoque) || 0;

  const novoDetalheCor = {
    id: `v${Date.now()}`,
    tamanho,
    cor,
    hex: hex || null,
    disponivel: (quantidadeEstoque > 0),
    estoque: quantidadeEstoque
  };

  try {
    // Busca o produto no banco usando o ID que veio no body
    const produtoAtual = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: { id: true, cores: true, coresDetalhes: true, estoquePorTamanho: true }
    });

    if (!produtoAtual) {
      return res.status(404).json({ 
        sucesso: false, 
        mensagem: `Produto com ID ${produtoId} não foi encontrado no banco!` 
      });
    }

    let listaCores = produtoAtual.cores || [];
    let listaDetalhes = Array.isArray(produtoAtual.coresDetalhes) ? produtoAtual.coresDetalhes : [];
    let estoqueTamanhos = produtoAtual.estoquePorTamanho || {};

    // Evita duplicar o nome da cor no array text[] global
    if (!listaCores.includes(cor)) {
      listaCores.push(cor);
    }
    
    // Adiciona o novo objeto no JSON de detalhes
    listaDetalhes.push(novoDetalheCor);

    // Garante que a estrutura de estoque por tamanho seja um objeto válido
    if (typeof estoqueTamanhos !== 'object' || estoqueTamanhos === null) {
      estoqueTamanhos = {};
    }

    if (!estoqueTamanhos[tamanho]) {
      estoqueTamanhos[tamanho] = {};
    }

    // Atrela a cor e o estoque de forma independente dentro do tamanho específico
    estoqueTamanhos[tamanho][cor] = {
      estoque: quantidadeEstoque,
      hex: hex || null,
      disponivel: quantidadeEstoque > 0
    };

    // Atualiza o produto no banco com os novos dados integrados
    const produtoAtualizado = await prisma.produto.update({
      where: { id: produtoId },
      data: { 
        cores: listaCores, 
        coresDetalhes: listaDetalhes,
        estoquePorTamanho: estoqueTamanhos
      }
    });

    console.log("Cor e estoque por tamanho salvos com sucesso no produto:", produtoAtualizado.id);

    return res.status(201).json({
      sucesso: true,
      mensagem: "Cor e estoque vinculados ao tamanho com sucesso!",
      cores: produtoAtualizado.cores,
      coresDetalhes: produtoAtualizado.coresDetalhes,
      estoquePorTamanho: produtoAtualizado.estoquePorTamanho
    });

  } catch (erro) {
    console.error("Erro crítico ao salvar cor/tamanho:", erro);
    return res.status(500).json({ 
      sucesso: false, 
      mensagem: "Erro interno ao salvar cor.", 
      detalhe: erro.message 
    });
  }
});

// ==========================================
// 3. Rota de Tamanhos (GET) para evitar o 404
// ==========================================
router.get('/api/admin/tamanhos', async (req, res) => {
  try {
    const tamanhos = await prisma.tamanho.findMany({ 
      orderBy: { createdAt: 'desc' } 
    });
    return res.status(200).json(tamanhos);
  } catch (erro) {
    console.error("Erro ao buscar tamanhos:", erro);
    return res.status(500).json({ sucesso: false, mensagem: "Erro ao buscar tamanhos." });
  }
});

// ==========================================
// 4. Rota de Perfil do Cliente para evitar o 404
// ==========================================
router.get('/api/cliente/perfil', async (req, res) => {
  return res.status(200).json({ logado: false, mensagem: "Rota padrão." });
});

module.exports = router;
