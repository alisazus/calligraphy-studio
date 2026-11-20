import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/** Everyone who has opened the app, keyed by the Gateway's user id. */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    orgId: text("org_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("users_email_idx").on(table.orgId, table.email)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    /** The composition as JSON (src/lib/composition.ts). */
    composition: text("composition").notNull(),
    /** An SVG of the design, for lists and the template gallery. */
    preview: text("preview"),
    isTemplate: integer("is_template", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("projects_owner_idx").on(table.ownerId, table.createdAt),
    index("projects_template_idx").on(table.isTemplate),
  ],
);

export const projectShares = sqliteTable(
  "project_shares",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_shares_user_idx").on(table.userId),
  ],
);
