const express = require('express');
const router = express.Router();

// Exemplo de banco de dados simulado em memória
const produtosCores = [
  {
    produtoId: "123",
    variantes: [
      { id: "v1", cor: "Preto", hex: "#000000", disponivel: true, estoque: 10 },
      { id: "v2", cor: "Branco", hex: "#FFFFFF", disponivel: true, estoque: 5 },
      { id: "v3", cor: "Azul", hex: "#0000FF", disponivel: false, estoque: 0 }
    ]
  }
];

// Rota 1: Buscar opções de cores de um produto específico pelo ID
router.get('/api/produtos/:id/cores', (req, res) => {
  const produtoId = req.params.id;
  const produto = produtosCores.find(p => p.produtoId === produtoId);

  if (!produto) {
    return res.status(404).json({ sucesso: false, mensagem: "Produto não encontrado." });
  }

  res.status(200).json({
    sucesso: true,
    produtoId: produto.produtoId,
    cores: produto.variantes
  });
});

// Rota 2: Cadastrar uma nova cor/variante para o produto
router.post('/api/produtos/:id/cores', (req, res) => {
  const produtoId = req.params.id;
  const { cor, hex, estoque } = req.body;

  if (!cor || !hex) {
    return res.status(400).json({ sucesso: false, mensagem: "Nome da cor e código HEX são obrigatórios." });
  }

  const novaVariante = {
    id: `v${Date.now()}`,
    cor,
    hex,
    disponivel: (estoque > 0),
    estoque: estoque || 0
  };

  let produto = produtosCores.find(p => p.produtoId === produtoId);
  if (!produto) {
    produto = { produtoId, variantes: [] };
    produtosCores.push(produto);
  }

  produto.variantes.push(novaVariante);

  res.status(201).json({
    sucesso: true,
    mensagem: "Cor adicionada com sucesso!",
    variante: novaVariante
  });
});

module.exports = router;
