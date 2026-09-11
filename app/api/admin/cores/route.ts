const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/api/produtos/:id/cores', async (req, res) => {
  const produtoId = req.params.id;
  
  // 🔍 ADICIONE ESTES LOGS PARA VERIFICAR NO TERMINAL DO NODE
  console.log("ID recebido na URL:", produtoId);
  console.log("Dados recebidos no body:", req.body);

  const { cor, hex, estoque } = req.body;

  if (!cor) {
    return res.status(400).json({ sucesso: false, mensagem: "O nome da cor é obrigatório." });
  }

  const novoDetalheCor = {
    id: `v${Date.now()}`,
    cor,
    hex: hex || null,
    disponivel: (Number(estoque) > 0),
    estoque: Number(estoque) || 0
  };

  try {
    const produtoAtual = await prisma.produto.findUnique({
      where: { id: produtoId },
      select: { id: true, cores: true, coresDetalhes: true }
    });

    console.log("Produto encontrado no banco:", produtoAtual);

    if (!produtoAtual) {
      return res.status(404).json({ sucesso: false, mensagem: "Produto não encontrado no banco com esse ID!" });
    }

    let listaCores = produtoAtual.cores || [];
    let listaDetalhes = Array.isArray(produtoAtual.coresDetalhes) ? produtoAtual.coresDetalhes : [];

    if (!listaCores.includes(cor)) {
      listaCores.push(cor);
    }
    listaDetalhes.push(novoDetalheCor);

    const produtoAtualizado = await prisma.produto.update({
      where: { id: produtoId },
      data: {
        cores: listaCores,
        coresDetalhes: listaDetalhes
      }
    });

    console.log("Produto atualizado com sucesso:", produtoAtualizado);

    res.status(201).json({
      sucesso: true,
      mensagem: "Cor salva com sucesso!",
      cores: produtoAtualizado.cores,
      coresDetalhes: produtoAtualizado.coresDetalhes
    });

  } catch (erro) {
    console.error("Erro crítico ao salvar cor:", erro);
    res.status(500).json({ sucesso: false, mensagem: "Erro interno", detalhe: erro.message });
  }
});
