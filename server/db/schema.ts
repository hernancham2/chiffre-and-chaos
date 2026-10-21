import { bigint, boolean, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// ───────── better-auth (con el plugin admin: role, banned, impersonatedBy) ─────────
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// ───────── juego ─────────
export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  text: text('text').notNull(),
  options: jsonb('options').$type<string[]>().notNull(),
  correctIndex: integer('correct_index').notNull(),
  source: text('source').$type<'semanario' | 'libre'>().notNull(),
  week: integer('week'),
  topic: text('topic').notNull().default(''),
  explanation: text('explanation').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
})

export const gameResults = pgTable('game_results', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  hostUserId: text('host_user_id').notNull(),
  finishedAt: bigint('finished_at', { mode: 'number' }).notNull(),
  totalQuestions: integer('total_questions').notNull(),
  result: jsonb('result').notNull(),
})

export const gameParticipants = pgTable('game_participants', {
  id: serial('id').primaryKey(),
  gameId: integer('game_id').notNull().references(() => gameResults.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
})
