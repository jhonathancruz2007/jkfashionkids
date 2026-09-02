"use server"

import { cookies } from "next/headers"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function getUserProfileDB(userId: string) {
  try {
    const clientes = await sql`
      SELECT * FROM "Cliente" 
      WHERE id::text = ${userId} OR email = ${userId} 
      LIMIT 1
    `
    if (clientes.length > 0) return clientes[0]

    return null
  } catch (error) {
    console.error("Erro ao buscar perfil no banco:", error)
    return null
  }
}

export async function getFavoritosDB(userId: string) {
  try {
    const favs = await sql`SELECT produto_id FROM favoritos WHERE user_id::text = ${userId}`
    return favs.map((f: any) => f.produto_id)
  } catch {
    return []
  }
}

export async function salvarPerfilAction(formData: {
  nome: string
  email: string
  telefone: string
  cep: string
  rua: string
  numero: string
  bairro: string
  cidade: string
  estado: string
  complemento: string
  endereco: any
}) {
  const cookieStore = await cookies()
  const userId = cookieStore.get("cliente_token")?.value || cookieStore.get("user_id")?.value

  if (!userId) {
    throw new Error("Usuário não autenticado. Faça login novamente.")
  }

  try {
    // Garante automaticamente que todas as colunas necessárias existam na tabela "Cliente"
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS telefone TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS cep TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS rua TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS numero TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS bairro TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS cidade TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS estado TEXT;`
    await sql`ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS complemento TEXT;`

    // Realiza a atualização com segurança
    await sql`
      UPDATE "Cliente" 
      SET nome = ${formData.nome}, 
          email = ${formData.email},
          telefone = ${formData.telefone}, 
          cep = ${formData.cep},
          rua = ${formData.rua},
          numero = ${formData.numero},
          bairro = ${formData.bairro},
          cidade = ${formData.cidade},
          estado = ${formData.estado},
          complemento = ${formData.complemento}
      WHERE id::text = ${userId} OR email = ${userId} OR email = ${formData.email}
    `
    return { success: true }
  } catch (err: any) {
    throw new Error("Erro ao gravar no banco Neon: " + err.message)
  }
}