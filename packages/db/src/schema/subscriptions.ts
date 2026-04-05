import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { subscribers } from './subscribers';
import { endpoints } from './endpoints';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriberId: uuid('subscriber_id').references(() => subscribers.id).notNull(),
  endpointId: uuid('endpoint_id').references(() => endpoints.id).notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'approved'|'rejected'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueSubscriberEndpoint: [table.subscriberId, table.endpointId],
}));