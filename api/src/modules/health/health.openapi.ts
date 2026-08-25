import { z } from "zod";
import { registry } from "~/config/openapi";

// ── GET /health ───────────────────────────────────────────────────────────────

registry.registerPath({
	method: "get",
	path: "/health",
	tags: ["Health"],
	summary: "Health check — returns server status and metrics",
	security: [],
	responses: {
		200: {
			description: "Server is healthy",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean().openapi({ example: true }),
						data: z.object({
							status: z.string().openapi({ example: "healthy" }),
							timestamp: z.string().openapi({ example: "2026-05-29T10:00:00.000Z" }),
							uptime: z.number().openapi({ example: 345.67 }),
							dependencies: z.object({
								database: z.string().openapi({ example: "healthy" }),
							}),
							ping: z.object({
								database: z.number().openapi({ example: 4 }),
								unit: z.literal("ms"),
							}),
						}),
					}),
				},
			},
		},
	},
});

// ── GET /health/ready ─────────────────────────────────────────────────────────

registry.registerPath({
	method: "get",
	path: "/health/ready",
	tags: ["Health"],
	summary: "Readiness check — returns 200 if server dependencies are fully ready",
	security: [],
	responses: {
		200: {
			description: "Server dependencies are ready",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean().openapi({ example: true }),
						data: z.object({
							status: z.string().openapi({ example: "healthy" }),
							dependencies: z.object({
								database: z.string().openapi({ example: "healthy" }),
							}),
						}),
					}),
				},
			},
		},
		503: {
			description: "Server dependencies are not ready",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean().openapi({ example: false }),
						data: z.object({
							status: z.string().openapi({ example: "unhealthy" }),
							dependencies: z.object({
								database: z.string().openapi({ example: "unhealthy" }),
							}),
						}),
					}),
				},
			},
		},
	},
});

// ── GET /openapi.json ─────────────────────────────────────────────────────────

registry.registerPath({
	method: "get",
	path: "/openapi.json",
	tags: ["Health"],
	summary: "Get OpenAPI specification as JSON",
	security: [],
	responses: {
		200: {
			description: "OpenAPI specification document",
			content: {
				"application/json": {
					schema: z.object({}).openapi({
						description: "JSON specification complying with OpenAPI 3.0",
					}),
				},
			},
		},
	},
});
