import { pgTable, text, timestamp, varchar, boolean, decimal, uuid, serial, integer } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- App tables ------------------------------------------------------------

// 1. Tabela de Perfil/Dados do Cliente
export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: text("usuario_id").notNull(), // Vínculo com a tabela de Auth existente
  nomeCompleto: text("nome_completo").notNull(),
  email: text("email").notNull(),
  senha: text("senha"),
  cpf: text("cpf"),
  telefone: text("telefone"),
  endereco: text("endereco"),
  cidade: text("cidade"),
  estado: text("estado"),
  cep: text("cep"),
  role: text("role").default("cliente").notNull(), // <-- Campo adicionado ('cliente' ou 'admin')
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
})

// 2. Tabela de Roupas Favoritadas
export const favoritos = pgTable('favoritos', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: text('usuario_id').notNull(),
  produtoId: text('produto_id').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

// 3. Tabela de Histórico de Compras/Pedidos
export const pedidos = pgTable('pedido', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: text('usuario_id').notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('pendente'), // 'pendente', 'pago', 'enviado', 'entregue'
  itens: text('itens').notNull(), // JSON em string contendo a lista de produtos comprados
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});