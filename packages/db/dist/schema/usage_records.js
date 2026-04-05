"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usageRecords = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const subscribers_1 = require("./subscribers");
const endpoints_1 = require("./endpoints");
exports.usageRecords = (0, pg_core_1.pgTable)('usage_records', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    subscriberId: (0, pg_core_1.uuid)('subscriber_id').references(() => subscribers_1.subscribers.id).notNull(),
    endpointId: (0, pg_core_1.uuid)('endpoint_id').references(() => endpoints_1.endpoints.id).notNull(),
    feedVersion: (0, pg_core_1.text)('feed_version').notNull(),
    format: (0, pg_core_1.text)('format').notNull(), // 'csv'|'xml'|'json'
    requestedAt: (0, pg_core_1.timestamp)('requested_at').notNull().defaultNow(),
    responseStatus: (0, pg_core_1.integer)('response_status').notNull(),
});
//# sourceMappingURL=usage_records.js.map