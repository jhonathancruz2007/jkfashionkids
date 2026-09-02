export type Genero = "feminino" | "masculino" | "unissex"

export type Produto = {
  id?: string;
  slug: string
  nome: string
  descricao: string
  preco: number
  imagem: string
  tamanhos: string[]
  genero: Genero
  categoria: string
}

export const produtos: Produto[] = [
  {
    slug: "camiseta-dino",
    nome: "Camiseta Dino",
    descricao: "Camiseta de algodão macio com estampa de dinossauro colorida.",
    preco: 59.9,
    imagem: "/kids-dino-tshirt.png",
    tamanhos: ["2", "4", "6", "8", "10"],
    genero: "masculino",
    categoria: "Camisetas",
  },
  {
    slug: "vestido-florzinha",
    nome: "Vestido Florzinha",
    descricao: "Vestido leve de verão com estampa de flores e babados fofos.",
    preco: 89.9,
    imagem: "/kids-floral-dress.png",
    tamanhos: ["2", "4", "6", "8"],
    genero: "feminino",
    categoria: "Vestidos",
  },
  {
    slug: "macacao-jeans",
    nome: "Macacão Jeans",
    descricao: "Macacão jeans confortável com alças reguláveis e bolso frontal.",
    preco: 119.9,
    imagem: "/kids-denim-overalls.png",
    tamanhos: ["1", "2", "3", "4"],
    genero: "unissex",
    categoria: "Macacões",
  },
  {
    slug: "conjunto-moletom",
    nome: "Conjunto Moletom",
    descricao: "Blusa e calça de moletom quentinho para os dias frios.",
    preco: 129.9,
    imagem: "/kids-sweatsuit-set.png",
    tamanhos: ["4", "6", "8", "10"],
    genero: "unissex",
    categoria: "Conjuntos",
  },
  {
    slug: "shorts-colorido",
    nome: "Shorts Colorido",
    descricao: "Shorts leve com cós elástico para brincar o dia todo.",
    preco: 49.9,
    imagem: "/kids-colorful-shorts.png",
    tamanhos: ["2", "4", "6", "8"],
    genero: "masculino",
    categoria: "Shorts",
  },
  {
    slug: "pijama-estrelas",
    nome: "Pijama Estrelas",
    descricao: "Pijama de algodão com estampa de estrelinhas brilhantes.",
    preco: 79.9,
    imagem: "/kids-star-pajamas.png",
    tamanhos: ["2", "4", "6", "8", "10"],
    genero: "unissex",
    categoria: "Pijamas",
  },
  {
    slug: "saia-bailarina",
    nome: "Saia Bailarina",
    descricao: "Saia rodada de tule com camadas fofas para arrasar.",
    preco: 69.9,
    imagem: "/kids-tutu-skirt.png",
    tamanhos: ["2", "4", "6", "8"],
    genero: "feminino",
    categoria: "Saias",
  },
  {
    slug: "camisa-polo",
    nome: "Camisa Polo",
    descricao: "Camisa polo de piquet com gola e botões, estilo esperto.",
    preco: 74.9,
    imagem: "/kids-polo-shirt.png",
    tamanhos: ["4", "6", "8", "10", "12"],
    genero: "masculino",
    categoria: "Camisas",
  },
]
