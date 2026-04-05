export declare const usageRecords: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "usage_records";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "usage_records";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        subscriberId: import("drizzle-orm/pg-core").PgColumn<{
            name: "subscriber_id";
            tableName: "usage_records";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        endpointId: import("drizzle-orm/pg-core").PgColumn<{
            name: "endpoint_id";
            tableName: "usage_records";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        feedVersion: import("drizzle-orm/pg-core").PgColumn<{
            name: "feed_version";
            tableName: "usage_records";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        format: import("drizzle-orm/pg-core").PgColumn<{
            name: "format";
            tableName: "usage_records";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        requestedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "requested_at";
            tableName: "usage_records";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        responseStatus: import("drizzle-orm/pg-core").PgColumn<{
            name: "response_status";
            tableName: "usage_records";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
//# sourceMappingURL=usage_records.d.ts.map