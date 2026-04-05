import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { publishers } from './publishers';

export const datafeeds = pgTable('datafeeds', {
    id: uuid('id').primaryKey().defaultRandom(),
    publisherId: uuid('publisher_id').references(() => publishers.id).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currentVersion: text('current_version').notNull().default('1.0.0'),
    lastIngestedAt: timestamp('last_ingested_at'),
    rowCount: integer('row_count'),
    s3Key: text('s3_key'), // path to latest original file in MinIO
    createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
    uniquePublisherName: [table.publisherId, table.name],
}));