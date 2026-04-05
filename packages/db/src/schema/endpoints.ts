import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { publishers } from './publishers';
import { datafeeds } from './datafeeds';

export const endpoints = pgTable('endpoints', {
    id: uuid('id').primaryKey().defaultRandom(),
    datafeedId: uuid('datafeed_id').references(() => datafeeds.id).notNull(),
    publisherId: uuid('publisher_id').references(() => publishers.id).notNull(),
    name: text('name').notNull(), // URL slug e.g. "prices"
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    uniquePublisherName: [table.publisherId, table.name],
}));