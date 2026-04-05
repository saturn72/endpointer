"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.datafeeds = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const publishers_1 = require("./publishers");
exports.datafeeds = (0, pg_core_1.pgTable)('datafeeds', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    publisherId: (0, pg_core_1.uuid)('publisher_id').references(() => publishers_1.publishers.id).notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    currentVersion: (0, pg_core_1.text)('current_version').notNull().default('1.0.0'),
    lastIngestedAt: (0, pg_core_1.timestamp)('last_ingested_at'),
    rowCount: (0, pg_core_1.integer)('row_count'),
    s3Key: (0, pg_core_1.text)('s3_key'), // path to latest original file in MinIO
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
}, (table) => ({
    uniquePublisherName: [table.publisherId, table.name],
}));
//# sourceMappingURL=datafeeds.js.map