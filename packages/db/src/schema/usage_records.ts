import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { subscribers } from './subscribers';
import { endpoints } from './endpoints';

export const usageRecords = pgTable('usage_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id').references(() => subscribers.id).notNull(),
    endpointId: uuid('endpoint_id').references(() => endpoints.id).notNull(),
    feedVersion: text('feed_version').notNull(),
    format: text('format').notNull(), // 'csv'|'xml'|'json'
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    responseStatus: integer('response_status').notNull(),
});