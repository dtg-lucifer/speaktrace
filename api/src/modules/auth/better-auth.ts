import { betterAuth } from "better-auth";
import { pool } from "~/shared/database";

export const auth = betterAuth({
	database: pool,
	secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || "speaktrace_super_secure_better_auth_secret_2026",
	baseURL: process.env.APP_URL || "http://localhost:8989",
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID || "mock_github_client_id",
			clientSecret: process.env.GITHUB_CLIENT_SECRET || "mock_github_client_secret",
		},
	},
	emailAndPassword: {
		enabled: true,
	},
});
