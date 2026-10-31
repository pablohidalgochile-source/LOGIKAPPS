import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accountConnections = sqliteTable("account_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  providerAccountName: text("provider_account_name").notNull().default(""),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull().default(""),
  tokenType: text("token_type").notNull().default("Bearer"),
  scopes: text("scopes").notNull().default(""),
  csrfToken: text("csrf_token").notNull(),
  accessExpiresAt: integer("access_expires_at").notNull(),
  refreshExpiresAt: integer("refresh_expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("account_connections_user_provider_unique").on(table.userId, table.provider),
]);

export const oauthFlows = sqliteTable("oauth_flows", {
  state: text("state").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  verifierCiphertext: text("verifier_ciphertext").notNull(),
  returnTo: text("return_to").notNull().default("/connections"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
