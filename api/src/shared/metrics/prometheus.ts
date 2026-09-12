import type { Request, Response, NextFunction } from "express";
import client from "prom-client";

// Collect default Node.js / process metrics
client.collectDefaultMetrics({ prefix: "speaktrace_" });

export const httpRequestsTotal = new client.Counter({
	name: "http_requests_total",
	help: "Total number of HTTP requests handled",
	labelNames: ["method", "route", "status"],
});

export const httpRequestDurationSeconds = new client.Histogram({
	name: "http_request_duration_seconds",
	help: "Histogram of HTTP request durations in seconds",
	labelNames: ["method", "route", "status"],
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const jobsCreatedTotal = new client.Counter({
	name: "speaktrace_jobs_created_total",
	help: "Total audio processing jobs initiated",
	labelNames: ["mime_type"],
});

export const tokensDeductedTotal = new client.Counter({
	name: "speaktrace_tokens_deducted_total",
	help: "Total tokens debited from user accounts",
});

export const activeWebSocketsGauge = new client.Gauge({
	name: "speaktrace_active_websockets",
	help: "Total active real-time WebSocket client connections",
});

/**
 * Express middleware to record Prometheus metrics for all incoming requests.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
	if (req.path === "/metrics" || req.path === "/health") {
		return next();
	}

	const start = process.hrtime();

	res.on("finish", () => {
		const [seconds, nanoseconds] = process.hrtime(start);
		const duration = seconds + nanoseconds / 1e9;
		const route = req.route?.path || req.path || "unknown";
		const status = res.statusCode.toString();

		httpRequestsTotal.inc({ method: req.method, route, status });
		httpRequestDurationSeconds.observe({ method: req.method, route, status }, duration);
	});

	next();
}

/**
 * Exposes /metrics for Prometheus scrapers
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
	res.set("Content-Type", client.register.contentType);
	res.end(await client.register.metrics());
}
