import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

// Limite rígido para Login e Cadastro: 5 tentativas por minuto por IP (Proteção Brute Force)
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/auth",
})

// Limite para Checkout/Criação de Pedidos: 10 requisições por minuto por IP (Proteção contra spam de PIX/pedidos)
export const checkoutRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  analytics: true,
  prefix: "@upstash/ratelimit/checkout",
})