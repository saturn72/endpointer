"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endpoints = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const publishers_1 = require("./publishers");
const datafeeds_1 = require("./datafeeds");
exports.endpoints = (0, pg_core_1.pgTable)('endpoints', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    datafeedId: (0, pg_core_1.uuid)('datafeed_id').references(() => datafeeds_1.datafeeds.id).notNull(),
    publisherId: (0, pg_core_1.uuid)('publisher_id').references(() => publishers_1.publishers.id).notNull(),
    name: (0, pg_core_1.text)('name').notNull(), // URL slug e.g. "prices"
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
}, (table) => ({
    uniquePublisherName: [table.publisherId, table.name],
}));
//# sourceMappingURL=endpoints.js.map