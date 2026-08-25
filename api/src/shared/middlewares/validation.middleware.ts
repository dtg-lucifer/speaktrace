import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { log as logger } from "./logger.middleware";

function isNestedSchema(schema: z.ZodSchema): boolean {
	if (schema instanceof z.ZodObject) {
		const shape = schema.shape;
		return "body" in shape || "query" in shape || "params" in shape;
	}
	return false;
}

function getValidationInput(req: Request, isNested: boolean): unknown {
	if (isNested) {
		return {
			body: req.body,
			query: req.query,
			params: req.params,
		};
	}
	if (req.method === "GET" || req.method === "DELETE") {
		return { ...req.query, ...req.params };
	}
	return { ...req.body, ...req.params };
}

function buildFieldErrors(issues: z.ZodIssue[], isNested: boolean): Record<string, string[]> {
	const fieldErrors: Record<string, string[]> = {};
	for (const issue of issues) {
		const pathParts = issue.path.map(String);
		const fieldPath = isNested && pathParts.length > 1 ? pathParts.slice(1).join(".") : pathParts.join(".");
		if (!fieldErrors[fieldPath]) {
			fieldErrors[fieldPath] = [];
		}
		fieldErrors[fieldPath].push(issue.message);
	}
	return fieldErrors;
}

export const validate =
	(schema: z.ZodSchema) =>
	(req: Request, res: Response, next: NextFunction): void => {
		const isNested = isNestedSchema(schema);
		const inputToValidate = getValidationInput(req, isNested);

		const result = schema.safeParse(inputToValidate);

		if (!result.success) {
			logger.warn("Validation failed", { path: req.path, errors: result.error.issues });

			const fieldErrors = buildFieldErrors(result.error.issues, isNested);
			const errorDetails = Object.entries(fieldErrors)
				.map(([field, messages]) => `${field}: ${messages[0]}`)
				.join(", ");

			const message = errorDetails || "Validation failed";

			res.status(400).json({
				success: false,
				message,
				errors: fieldErrors,
			});
			return;
		}

		const data = result.data as Record<string, unknown>;
		if (isNested) {
			if (data.body !== undefined) req.body = data.body;
			if (data.query !== undefined) req.query = data.query as Record<string, string>;
			if (data.params !== undefined) req.params = data.params as Record<string, string>;
		} else {
			if (req.method === "GET" || req.method === "DELETE") {
				req.query = data as Record<string, string>;
			} else {
				req.body = data;
			}
		}

		logger.debug("Validation successful", { path: req.path });
		next();
	};
