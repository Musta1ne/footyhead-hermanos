import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Sólo se guarda el encuentro inicial. La pelota y el marcador nunca pasan por aquí.
export const rooms = sqliteTable("rooms", {
  pin: text("pin").primaryKey(),
  host: text("host").notNull(),
  guest: text("guest"),
  offer: text("offer"),
  answer: text("answer"),
  expires: integer("expires").notNull(),
}, table => [index("rooms_expires").on(table.expires)]);
