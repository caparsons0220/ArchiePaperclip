import type { HomeChatMessage } from "@paperclipai/shared/home-chat";
import { index, pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

export const homeChatThreads = pgTable(
  "home_chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    ownerUserId: text("owner_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    selectedModelId: text("selected_model_id").notNull(),
    messages: jsonb("messages").$type<HomeChatMessage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyOwnerUpdatedIdx: index("home_chat_threads_company_owner_updated_idx").on(
      table.companyId,
      table.ownerUserId,
      table.updatedAt,
    ),
    companyUpdatedIdx: index("home_chat_threads_company_updated_idx").on(table.companyId, table.updatedAt),
  }),
);
