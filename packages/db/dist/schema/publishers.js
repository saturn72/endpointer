"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.publishers = (0, pg_core_1.pgTable)('publishers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    clerkUserId: (0, pg_core_1.text)('clerk_user_id').unique().notNull(),
    name: (0, pg_core_1.text)('name').unique().notNull(), // URL slug e.g. "acme-widgets"
    displayName: (0, pg_core_1.text)('display_name').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=publishers.js.map