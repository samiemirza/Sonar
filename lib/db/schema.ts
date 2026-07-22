import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const investorType = pgEnum("investor_type", ["fund", "angel"]);

export const sourceKind = pgEnum("source_kind", [
  "blog",
  "rss",
  "transcript",
  "x_post",
]);

export const investors = pgTable(
  "investors",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    firm: text("firm"),
    slug: text("slug").notNull(),
    type: investorType("type").notNull().default("fund"),
    stageFocus: text("stage_focus").array().notNull().default([]),
    siteUrl: text("site_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("investors_slug_idx").on(t.slug)],
);

export const sources = pgTable(
  "sources",
  {
    id: serial("id").primaryKey(),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: sourceKind("kind").notNull(),
    title: text("title"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rawText: text("raw_text").notNull(),
  },
  (t) => [
    index("sources_investor_id_idx").on(t.investorId),
    uniqueIndex("sources_url_idx").on(t.url),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    tokenCount: integer("token_count").notNull(),
  },
  (t) => [
    index("chunks_source_id_idx").on(t.sourceId),
    index("chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// Themes are extracted as claims, each tied to the source chunk it came from.
export type ThesisTheme = {
  theme: string;
  evidence: string;
  sourceId: number;
};

export const theses = pgTable(
  "theses",
  {
    id: serial("id").primaryKey(),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    sectors: text("sectors").array().notNull().default([]),
    stages: text("stages").array().notNull().default([]),
    themes: jsonb("themes").$type<ThesisTheme[]>().notNull().default([]),
    checkSize: text("check_size"),
    summary: text("summary").notNull(),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    promptVersion: text("prompt_version").notNull(),
    // Provenance: every thesis must trace back to at least one source.
    sourceIds: integer("source_ids").array().notNull(),
  },
  (t) => [index("theses_investor_id_idx").on(t.investorId)],
);

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    investorId: integer("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    signalDate: timestamp("signal_date", { withTimezone: true }).notNull(),
    strength: smallint("strength").notNull(),
    // Provenance rule: a signal without a source cannot exist.
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (t) => [index("signals_investor_id_idx").on(t.investorId)],
);

export type Investor = typeof investors.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Thesis = typeof theses.$inferSelect;
export type Signal = typeof signals.$inferSelect;
