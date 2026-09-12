import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Señalización y dos buzones acotados para el respaldo HTTPS.
export const rooms = sqliteTable("rooms", {
  pin: text("pin").primaryKey(),
  host: text("host").notNull(),
  guest: text("guest"),
  offer: text("offer"),
  answer: text("answer"),
  hostIce: text("host_ice"),
  guestIce: text("guest_ice"),
  relay: integer("relay").notNull().default(0),
  hostRelay: text("host_relay"),
  guestRelay: text("guest_relay"),
  expires: integer("expires").notNull(),
}, table => [index("rooms_expires").on(table.expires)]);
