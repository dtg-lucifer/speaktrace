import { type NextFunction, type Request, type Response, Router } from "express";
import { env } from "~/config/env";
import { asyncHandler } from "~/shared/middlewares";
import { errorResponse, successResponse } from "~/shared/utils/response";
import { formatUptime } from "~/shared/utils/time";

export class HealthController {
	readonly router: Router;

	constructor() {
		this.router = Router();
		this.registerRoutes();
	}

	private registerRoutes(): void {
		this.router.get("/", asyncHandler(this.healthcheck));
	}

	private healthcheck = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
		const requestStartTime = Date.now();

		try {
			const { db } = res.locals;

			const metrics: Record<string, unknown> = {
				status: "healthy",
				timestamp: new Date().toISOString(),
				environment: env.NODE_ENV,
			};

			const pings: Record<string, number | string> = {};

			if (db) {
				try {
					const dbStart = Date.now();
					await db.query("SELECT 1");
					pings.database = Date.now() - dbStart;
				} catch (_dbError) {
					pings.database = "error";
				}
			}

			const uptimeMs = process.uptime() * 1000;
			metrics.uptime = {
				milliseconds: Math.floor(uptimeMs),
				formatted: formatUptime(uptimeMs),
				startedAt: new Date(Date.now() - uptimeMs).toISOString(),
			};
			metrics.memory = {
				used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
				total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
				unit: "MB",
			};
			metrics.services = {
				database: pings.database !== "error" ? "connected" : "error",
			};
			metrics.ping = {
				database: pings.database ?? "unknown",
				unit: "ms",
			};

			const serverResponseTime = Date.now() - requestStartTime;
			(metrics.ping as Record<string, number | string>).server = serverResponseTime;

			successResponse(res, metrics, "Server is up and running!!");
		} catch (_error) {
			errorResponse(res, "Health check failed", 500);
		}
	};
}
