const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Rota 1: Buscar opções de cores de um produto específico pelo ID
router.get('/api/produtos/:id/cores', async (req, res) => {
  const produtoId = req.params.id;

  try {
    const produto = await prisma.produto.findUnique({
      where: { id: produtoId }, // Ajuste para o nome correto da chave primaria se for diferente (ex: id ou produtoId)
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

  if (!cor || !hex) {
    return res.status(400).json({ sucesso: false, mensagem: "Nome da cor e código HEX são obrigatórios." });
  }

  const novaVariante = {
    id: `v${Date.now()}`,
    cor,
    hex,
    disponivel: (Number(estoque) > 0),
    estoque: Number(estoque) || 0
  };

  try {
    // Busca o produto atual para pegar os arrays/json existentes
    const produtoExistente = await prisma.produto.findUnique({
      where: { id: produtoId }
    });

    let listaCores = produtoExistente?.cores || [];
    let listaDetalhes = produtoExistente?.coresDetalhes || [];

    // Adiciona o nome da cor na lista text[] se já não existir
    if (!listaCores.includes(cor)) {
      listaCores.push(cor);
    }

    // Adiciona o objeto detalhado no jsonb
    if (Array.isArray(listaDetalhes)) {
      listaDetalhes.push(novaVariante);
    } else {
      listaDetalhes = [novaVariante];
    }

    // Atualiza ou cria o produto com os novos dados usando upsert
    const produtoAtualizado = await prisma.produto.upsert({
      where: { id: produtoId },
      update: {
        cores: listaCores,
        coresDetalhes: listaDetalhes
      },
      create: {
        id: produtoId,
        cores: [cor],
        coresDetalhes: [novaVariante]
      }
    });

    res.status(201).json({
      sucesso: true,
      mensagem: "Cor adicionada com sucesso no banco via Prisma!",
      variante: novaVariante,
      produto: produtoAtualizado
    });
  } catch (erro) {
    console.error("Erro ao salvar cor:", erro);
    res.status(500).json({ sucesso: false, mensagem: "Erro ao salvar no banco de dados." });
  }
});

module.exports = router;
