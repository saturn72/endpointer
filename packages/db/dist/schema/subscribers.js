"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.subscribers = (0, pg_core_1.pgTable)('subscribers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    clerkUserId: (0, pg_core_1.text)('clerk_user_id').unique().notNull(),
    email: (0, pg_core_1.text)('email').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=subscribers.js.map