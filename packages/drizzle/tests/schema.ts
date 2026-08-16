import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  price: integer("price"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
});
