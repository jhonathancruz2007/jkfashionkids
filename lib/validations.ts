import { z } from "zod"

// Validação para Login
export const loginSchema = z.object({
  email: z.string().email("Formato de e-mail inválido."),
  senha: z.string().min(1, "A senha é obrigatória."),
})

// Validação para Cadastro
export const registerSchema = z.object({
  nome: z.string().min(2, "O nome deve ter no mínimo 2 caracteres."),
  email: z.string().email("Formato de e-mail inválido."),
  senha: z.string().min(6, "A senha deve conter no mínimo 6 caracteres."),
  telefone: z.string().optional().nullable(),
})

// Validação para Checkout
export const checkoutSchema = z.object({
  itens: z.array(
    z.object({
      id: z.coerce.number(),
      quantidade: z.number().int().positive("A quantidade deve ser maior que zero."),
      tamanho: z.string().optional().nullable(),
    })
  ).min(1, "O carrinho não pode estar vazio."),
  meiodepagamento: z.enum(["pix", "cartao", "boleto"]),
  dadosEntrega: z.object({
    cep: z.string().optional().nullable(),
    rua: z.string().optional().nullable(),
    numero: z.string().optional().nullable(),
    complemento: z.string().optional().nullable(),
    bairro: z.string().optional().nullable(),
    cidade: z.string().optional().nullable(),
    estado: z.string().optional().nullable(),
    valorFrete: z.number().nonnegative().optional(),
  }).optional(),
  cliente: z.object({
    email: z.string().email("E-mail do cliente inválido."),
    nome: z.string().optional(),
    telefone: z.string().optional().nullable(),
  }),
})