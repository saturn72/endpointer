"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const subscribers_1 = require("./subscribers");
const endpoints_1 = require("./endpoints");
exports.subscriptions = (0, pg_core_1.pgTable)('subscriptions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    subscriberId: (0, pg_core_1.uuid)('subscriber_id').references(() => subscribers_1.subscribers.id).notNull(),
    endpointId: (0, pg_core_1.uuid)('endpoint_id').references(() => endpoints_1.endpoints.id).notNull(),
    status: (0, pg_core_1.text)('status').notNull().default('pending'), // 'pending'|'approved'|'rejected'
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, (table) => ({
    uniqueSubscriberEndpoint: [table.subscriberId, table.endpointId],
}));
//# sourceMappingURL=subscriptions.js.map