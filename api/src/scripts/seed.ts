import * as dotenv from "dotenv";
import { Pool } from "pg";
import { hashPassword } from "~/lib/password";

dotenv.config();

const connectionString = process.env.DATABASE_URL || "postgresql://piush:root_123_allmighty@localhost:5432/speaktrace_db";

const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "admin@speaktrace.com";
const superAdminPass = process.env.SUPER_ADMIN_PASS || "admin123456";

async function seed() {
	console.log("🌱 Starting SpeakTrace database seed...");
	const pool = new Pool({ connectionString });

	try {
		// 1. Seed system_settings
		console.log("⚙️  Seeding system_settings...");
		const defaultSettings = [
			{ key: "default_free_credits", value: 50, description: "Default initial free credits for new user self-registration" },
			{
				key: "credit_cost_per_minute_transcription",
				value: 10,
				description: "Credit cost per minute of audio speech-to-text transcription",
			},
			{ key: "credit_cost_per_minute_diarization", value: 0, description: "Credit cost per minute of audio speaker diarization" },
			{
				key: "credit_cost_per_minute_enrichment",
				value: 0,
				description: "Credit cost per minute of audio emotion & punctuation tagging",
			},
			{ key: "credit_cost_rag_indexing", value: 0, description: "Fixed credit cost per job for vector RAG indexing" },
			{ key: "credit_cost_export", value: 0, description: "Credit cost per custom document export rendering" },
		];

		for (const setting of defaultSettings) {
			await pool.query(
				`INSERT INTO system_settings (key, value, description, updated_at)
				 VALUES ($1, $2::jsonb, $3, NOW())
				 ON CONFLICT (key) DO UPDATE
				 SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()`,
				[setting.key, JSON.stringify(setting.value), setting.description],
			);
		}
		console.log("✅ System settings seeded.");

		// 2. Seed Users
		console.log("👥 Seeding initial SaaS users (Admin, Normal, Paid)...");
		const usersToSeed = [
			{
				email: superAdminEmail,
				password: superAdminPass,
				role: "admin",
				plan: "enterprise",
				credits: 10000.0,
			},
			{
				email: "user@speaktrace.com",
				password: "user123456",
				role: "member",
				plan: "free",
				credits: 50.0,
			},
			{
				email: "paid@speaktrace.com",
				password: "paid123456",
				role: "member",
				plan: "pro",
				credits: 1000.0,
			},
			{
				email: "test@speaktrace.com",
				password: "test123456",
				role: "member",
				plan: "enterprise",
				credits: 10000.0,
			},
		];

		for (const u of usersToSeed) {
			const passHash = await hashPassword(u.password);

			const res = await pool.query(
				`INSERT INTO users (email, password_hash, role, plan, credits, is_active)
				 VALUES ($1, $2, $3, $4, $5, TRUE)
				 ON CONFLICT (email) DO UPDATE
				 SET role = EXCLUDED.role, plan = EXCLUDED.plan, credits = EXCLUDED.credits, password_hash = EXCLUDED.password_hash, updated_at = NOW()
				 RETURNING id, email, role, plan, credits`,
				[u.email, passHash, u.role, u.plan, u.credits],
			);

			const createdUser = res.rows[0];
			if (createdUser) {
				// Record initial ledger transaction
				await pool.query(
					`INSERT INTO credit_transactions (user_id, amount, balance_after, type, description)
					 VALUES ($1, $2, $3, $4, $5)`,
					[createdUser.id, u.credits, u.credits, "initial_seed", `Initial seed grant for ${u.role} user (${u.plan} plan)`],
				);
				console.log(
					`  - User: ${createdUser.email} | Role: ${createdUser.role} | Plan: ${createdUser.plan} | Credits: ${createdUser.credits}`,
				);
			}
		}

		console.log("✅ Seed completed successfully!");
	} catch (err) {
		console.error("❌ Seed failed:", err);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

seed();
