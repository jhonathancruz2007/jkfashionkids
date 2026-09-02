"use server"

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Buscar favoritos do usuário logado
turma: async function getFavoritos(userId: string) {
  try {
    const result = await sql`SELECT produto_id FROM favoritos WHERE user_id = ${userId}`
    return result.map((row) => row.produto_id)
  } catch (error) {
    console.error("Erro ao buscar favoritos:", error)
    return []
  }
}

// Adicionar ou remover favorito (Toggle)
export async function toggleFavoritoDB(userId: string, produtoId: number) {
  if (!userId) return { success: false, message: "Usuário não autenticado" }

  try {
    // Verifica se já existe
    const existe = await sql`
      SELECT id FROM favoritos WHERE user_id = ${userId} AND produto_id = ${produtoId}
    `

    if (existe.length > 0) {
      // Se já existe, remove
      await sql`DELETE FROM favoritos WHERE user_id = ${userId} AND produto_id = ${produtoId}`
      return { success: true, favoritado: false }
    } else {
      // Se não existe, insere
      await sql`INSERT INTO favoritos (user_id, produto_id) VALUES (${userId}, ${produtoId})`
      return { success: true, favoritado: true }
    }
  } catch (error) {
    console.error("Erro ao atualizar favorito:", error)
    return { success: false, message: "Erro ao atualizar" }
  }
}