const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Rota 1: Buscar opções de cores de um produto específico pelo ID
router.get('/api/produtos/:id/cores', async (req, res) => {
  const produtoId = req.params.id;

  try {
    const produto = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: {
        id: true,
        cores: true,
        coresDetalhes: true
      }
    });

    if (!produto) {
      return res.status(404).json({ sucesso: false, mensagem: "Produto não encontrado." });
    }

    res.status(200).json({
      sucesso: true,
      produtoId: produto.id,
      cores: produto.cores,
      coresDetalhes: produto.coresDetalhes
    });
  } catch (erro) {
    console.error("Erro ao buscar cores:", erro);
    res.status(500).json({ sucesso: false, mensagem: "Erro interno no servidor." });
  }
});

// Rota 2: Cadastrar uma nova cor/variante para o produto
router.post('/api/produtos/:id/cores', async (req, res) => {
  const produtoId = req.params.id;
  const { cor, hex, estoque } = req.body;

  if (!cor) {
    return res.status(400).json({ sucesso: false, mensagem: "O nome da cor é obrigatório." });
  }

  // Objeto estruturado compatível com o campo jsonb 'coresDetalhes'
  const novoDetalheCor = {
    id: `v${Date.now()}`,
    cor,
    hex: hex || null,
    disponivel: (Number(estoque) > 0),
    estoque: Number(estoque) || 0
  };

  try {
    // 1. Busca o produto para checar os arrays atuais
    const produtoExistente = await prisma.produto.findUnique({
      where: { id: produtoId }
    });

    if (!produtoExistente) {
      return res.status(404).json({ sucesso: false, mensagem: "Produto não encontrado para adicionar a cor." });
    }

    let listaCores = produtoExistente.cores || [];
    let listaDetalhes = produtoExistente.coresDetalhes || [];

    // 2. Adiciona o nome da cor no array text[] se já não estiver lá
    if (!listaCores.includes(cor)) {
      listaCores.push(cor);
    }

    // 3. Adiciona o objeto detalhado no array do JSON
    if (Array.isArray(listaDetalhes)) {
      listaDetalhes.push(novoDetalheCor);
    } else {
      listaDetalhes = [novoDetalheCor];
    }

    // 4. Salva no banco de dados atualizando os campos corretos do seu schema
    const produtoAtualizado = await prisma.produto.update({
      where: { id: produtoId },
      data: {
        cores: listaCores,
        coresDetalhes: listaDetalhes
      }
    });

    res.status(201).json({
      sucesso: true,
      mensagem: "Cor adicionada com sucesso ao produto!",
      cores: produtoAtualizado.cores,
      coresDetalhes: produtoAtualizado.coresDetalhes
    });
  } catch (erro) {
    console.error("Erro ao salvar cor:", erro);
    res.status(500).json({ sucesso: false, mensagem: "Erro ao salvar a cor no banco de dados." });
  }
});

module.exports = router;
