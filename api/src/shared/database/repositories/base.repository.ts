import type { PoolClient } from "pg";
import { logger } from "~/shared/logging";
import type { IDatabase } from "../database";
import { getDatabase } from "../database";

/**
 * Base repository — all module repositories extend this.
 *
 * Dependency injection: pass an IDatabase instance in the constructor
 * (defaults to the singleton) so repositories can be tested with a mock.
 */
export abstract class BaseRepository {
	protected readonly db: IDatabase;

	constructor(db: IDatabase = getDatabase()) {
		this.db = db;
	}

	/**
	 * Run a set of queries inside a single transaction.
	 * The callback receives a connected PoolClient; commit/rollback are
	 * handled automatically. SQL queries executed inside transactions are logged with execution duration.
	 */
	protected async transaction<R>(callback: (client: PoolClient) => Promise<R>): Promise<R> {
		const client = await this.db.connect();

		// Wrap client.query to log transactional SQL queries
		const rawQuery = client.query.bind(client);
		// biome-ignore lint/suspicious/noExplicitAny: pg PoolClient query overload wrapper
		client.query = (async (queryTextOrConfig: any, values?: any, callbackFunc?: any) => {
			const sql = typeof queryTextOrConfig === "string" ? queryTextOrConfig : (queryTextOrConfig?.text ?? "");
			const params = values ?? (typeof queryTextOrConfig === "object" ? queryTextOrConfig?.values : undefined);
			const startTime = Date.now();
			const singleLineSql = sql.replace(/\s+/g, " ").trim();

			try {
				const result = await rawQuery(queryTextOrConfig, values, callbackFunc);
				const duration = Date.now() - startTime;
				if (singleLineSql && !["BEGIN", "COMMIT", "ROLLBACK"].includes(singleLineSql.toUpperCase())) {
					const rowCount = (result as unknown as { rowCount?: number })?.rowCount ?? 0;
					logger.info(
						`[SQL:TX] ${singleLineSql} | Params: ${JSON.stringify(params ?? [])} | Duration: ${duration}ms | Rows: ${rowCount}`,
					);
				}
				return result;
			} catch (error) {
				const duration = Date.now() - startTime;
				logger.error(
					`[SQL:TX:ERROR] ${singleLineSql} | Params: ${JSON.stringify(params ?? [])} | Duration: ${duration}ms | Error: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				throw error;
			}
		}) as typeof client.query;

		try {
			await rawQuery("BEGIN");
			const result = await callback(client);
			await rawQuery("COMMIT");
			return result;
		} catch (error) {
			await rawQuery("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	}
}
