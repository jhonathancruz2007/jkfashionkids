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
// 2. ROTA POST: Adiciona a cor ao produto (pegando o ID do corpo da requisição)
// ==========================================
router.post('/api/admin/cores', async (req, res) => {
  // Exibe o que o front-end está enviando no body para conferirmos
  console.log("Dados recebidos no body para salvar cor:", req.body);

  const { produtoId, cor, hex, estoque } = req.body;

  if (!produtoId || !cor) {
    return res.status(400).json({ 
      sucesso: false, 
      mensagem: "O ID do produto e o nome da cor são obrigatórios no corpo da requisição." 
    });
  }

  const novoDetalheCor = {
    id: `v${Date.now()}`,
    cor,
    hex: hex || null,
    disponivel: (Number(estoque) > 0),
    estoque: Number(estoque) || 0
  };

  try {
    // Busca o produto no banco usando o ID que veio no body
    const produtoAtual = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: { id: true, cores: true, coresDetalhes: true }
    });

    if (!produtoAtual) {
      return res.status(404).json({ 
        sucesso: false, 
        mensagem: `Produto com ID ${produtoId} não foi encontrado no banco!` 
      });
    }

    let listaCores = produtoAtual.cores || [];
    let listaDetalhes = Array.isArray(produtoAtual.coresDetalhes) ? produtoAtual.coresDetalhes : [];

    // Evita duplicar o nome da cor no array text[]
    if (!listaCores.includes(cor)) {
      listaCores.push(cor);
    }
    
    // Adiciona o novo objeto no JSON de detalhes
    listaDetalhes.push(novoDetalheCor);

    // Atualiza o produto no banco
    const produtoAtualizado = await prisma.produto.update({
      where: { id: produtoId },
      data: { 
        cores: listaCores, 
        coresDetalhes: listaDetalhes 
      }
    });

    console.log("Cor salva com sucesso no produto:", produtoAtualizado.id);

    return res.status(201).json({
      sucesso: true,
      mensagem: "Cor salva com sucesso!",
      cores: produtoAtualizado.cores,
      coresDetalhes: produtoAtualizado.coresDetalhes
    });

  } catch (erro) {
    console.error("Erro crítico ao salvar cor:", erro);
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
