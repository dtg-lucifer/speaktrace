import { z } from "zod";
import { BaseRepository } from "~/shared/database/repositories";

export const SystemSettingRowSchema = z.object({
	key: z.string(),
	value: z.any(),
	description: z.string().nullable().optional(),
	updated_at: z.coerce.date(),
});

export type SystemSettingRow = z.infer<typeof SystemSettingRowSchema>;

export const CreditTransactionRowSchema = z.object({
	id: z.string().uuid(),
	user_id: z.string().uuid(),
	amount: z.coerce.number(),
	balance_after: z.coerce.number(),
	type: z.string(),
	description: z.string().nullable().optional(),
	job_id: z.string().uuid().nullable().optional(),
	created_at: z.coerce.date(),
});

export type CreditTransactionRow = z.infer<typeof CreditTransactionRowSchema>;

export interface ISystemSettingsRepository {
	getSettingByKey<T = unknown>(key: string): Promise<T | null>;
	getAllSettings(): Promise<Record<string, unknown>>;
	upsertSetting(key: string, value: unknown, description?: string): Promise<void>;
	deductCredits(userId: string, amount: number, type: string, description: string, jobId?: string): Promise<{ creditsRemaining: number }>;
	grantCredits(userId: string, amount: number, type: string, description: string, jobId?: string): Promise<{ creditsRemaining: number }>;
	getCreditTransactions(
		userId: string,
		opts?: { limit?: number; offset?: number },
	): Promise<{ transactions: CreditTransactionRow[]; total: number }>;
}

export class SystemSettingsRepository extends BaseRepository implements ISystemSettingsRepository {
	async getSettingByKey<T = unknown>(key: string): Promise<T | null> {
		const rows = await this.db.query<{ value: unknown }>(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [key]);
		if (!rows[0]) return null;
		return rows[0].value as T;
	}

	async getAllSettings(): Promise<Record<string, unknown>> {
		const rows = await this.db.query<{ key: string; value: unknown }>(`SELECT key, value FROM system_settings`);
		const result: Record<string, unknown> = {};
		for (const row of rows) {
			result[row.key] = row.value;
		}
		return result;
	}

	async upsertSetting(key: string, value: unknown, description?: string): Promise<void> {
		await this.db.query(
			`INSERT INTO system_settings (key, value, description, updated_at)
			 VALUES ($1, $2::jsonb, $3, NOW())
			 ON CONFLICT (key) DO UPDATE
			 SET value = EXCLUDED.value, description = COALESCE(EXCLUDED.description, system_settings.description), updated_at = NOW()`,
			[key, JSON.stringify(value), description ?? null],
		);
	}

	async deductCredits(
		userId: string,
		amount: number,
		type: string,
		description: string,
		jobId?: string,
	): Promise<{ creditsRemaining: number }> {
		return this.transaction(async (client) => {
			const userRes = await client.query<{ credits: string }>(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);

			if (!userRes.rows[0]) {
				throw new Error("User not found for credit deduction");
			}

			const currentCredits = parseFloat(userRes.rows[0].credits);
			if (currentCredits < amount) {
				throw new Error(`INSUFFICIENT_CREDITS: Required ${amount}, available ${currentCredits}`);
			}

			const balanceAfter = currentCredits - amount;

			await client.query(`UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2`, [balanceAfter, userId]);

			await client.query(
				`INSERT INTO credit_transactions (user_id, amount, balance_after, type, description, job_id)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[userId, -amount, balanceAfter, type, description, jobId ?? null],
			);

			return { creditsRemaining: balanceAfter };
		});
	}

	async grantCredits(
		userId: string,
		amount: number,
		type: string,
		description: string,
		jobId?: string,
	): Promise<{ creditsRemaining: number }> {
		return this.transaction(async (client) => {
			const userRes = await client.query<{ credits: string }>(`SELECT credits FROM users WHERE id = $1 FOR UPDATE`, [userId]);

			if (!userRes.rows[0]) {
				throw new Error("User not found for credit grant");
			}

			const currentCredits = parseFloat(userRes.rows[0].credits);
			const balanceAfter = currentCredits + amount;

			await client.query(`UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2`, [balanceAfter, userId]);

			await client.query(
				`INSERT INTO credit_transactions (user_id, amount, balance_after, type, description, job_id)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[userId, amount, balanceAfter, type, description, jobId ?? null],
			);

			return { creditsRemaining: balanceAfter };
		});
	}

	async getCreditTransactions(
		userId: string,
		opts?: { limit?: number; offset?: number },
	): Promise<{ transactions: CreditTransactionRow[]; total: number }> {
		const limit = opts?.limit ?? 20;
		const offset = opts?.offset ?? 0;

		const countRes = await this.db.query<{ count: string }>(`SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1`, [userId]);
		const total = parseInt(countRes[0]?.count ?? "0", 10);

		const rows = await this.db.query<CreditTransactionRow>(
			`SELECT id, user_id, amount, balance_after, type, description, job_id, created_at
			 FROM credit_transactions
			 WHERE user_id = $1
			 ORDER BY created_at DESC
			 LIMIT $2 OFFSET $3`,
			[userId, limit, offset],
		);

		return {
			transactions: rows.map((r) => CreditTransactionRowSchema.parse(r)),
			total,
		};
	}
}
