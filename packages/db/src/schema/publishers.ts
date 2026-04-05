import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const publishers = pgTable('publishers', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').unique().notNull(),
  name: text('name').unique().notNull(), // URL slug e.g. "acme-widgets"
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});