# JK Fashion Kids — otimização de carregamento

Esta versão mantém o layout e as funcionalidades existentes e reduz trabalho no carregamento inicial.

## Alterações

- Banner principal convertido para `Principal.webp`, reduzindo o arquivo de aproximadamente 420 KB para aproximadamente 190 KB, e carregamento prioritário apenas da primeira imagem.
- Imagens dos cards de produto usam carregamento `lazy` e `decoding=async`; a segunda imagem de cada card não bloqueia a abertura da página.
- A consulta de produtos e a consulta de sessão da Home agora acontecem em paralelo.
- A lista de produtos da Home e do catálogo usa `sessionStorage` como cache de resposta anterior e é atualizada em segundo plano.
- A rota pública `/api/produtos` passou a ter cache curto na borda/CDN, com revalidação rápida.
- O catálogo deixou de fazer a chamada sequencial para categorias antes de buscar os produtos; as categorias são derivadas dos próprios produtos retornados.
- O Header, a Home e o aviso de estoque deixaram de consultar o endpoint pesado de perfil com histórico de pedidos; foi criada a rota leve `/api/cliente/resumo`.
- O carregamento inicial do carrinho usa primeiro o estado salvo no navegador e sincroniza com o servidor em segundo plano.
- Favoritos fazem a mesma hidratação local antes da sincronização com o servidor.
- Removida a requisição duplicada ao favoritar um produto.
- O `next.config.mjs` deixou de desativar a otimização de imagens do Next.js.

## Deploy na Vercel

1. Substitua os arquivos do projeto pelos arquivos desta versão.
2. Envie a nova versão para o mesmo repositório/projeto conectado à Vercel.
3. Faça um novo deploy.
4. Depois do deploy, teste `/`, `/catalogo`, login, carrinho, favoritos e uma página de produto.

O arquivo `Principal.jpg` original foi mantido como fallback/backup.
