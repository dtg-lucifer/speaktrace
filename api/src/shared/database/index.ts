export * from "./database";
export * from "./providers/postgres.provider";
export * from "./repositories";

import { PostgresProvider } from "./providers/postgres.provider";
export const dbProvider = new PostgresProvider();
export const pool = dbProvider.getPool();
