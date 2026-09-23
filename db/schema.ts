import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Señalización WebRTC. Las columnas relay son heredadas y ya no se usan.
export const rooms = sqliteTable("rooms", {
  pin: text("pin").primaryKey(),
  host: text("host").notNull(),
  mode: text("mode").notNull().default("timed"),
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
