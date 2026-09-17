import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const sessions=sqliteTable("exchange_sessions",{id:text("id").primaryKey(),revision:integer("revision").notNull().default(0),state:text("state").notNull()});
export const addresses=sqliteTable("invoice_addresses",{address:text("address").primaryKey(),owner:text("owner").notNull(),trade:text("trade").notNull()});
export const requestLimits=sqliteTable("request_limits",{id:text("id").primaryKey(),window:integer("window").notNull(),count:integer("count").notNull()});
