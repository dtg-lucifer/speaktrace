import { z } from "zod";

export const uploadQuerySchema = z.object({
	projectId: z.string().uuid().optional(),
	emotionTagging: z
		.string()
		.optional()
		.transform((v) => v === "true"),
	punctuation: z
		.string()
		.optional()
		.transform((v) => v !== "false"), // default true
	language: z.string().min(2).max(10).optional().default("en"),
});

export const listAssetsQuerySchema = z.object({
	limit: z
		.string()
		.optional()
		.transform((v) => Math.min(Number(v ?? "20"), 100)),
	offset: z
		.string()
		.optional()
		.transform((v) => Number(v ?? "0")),
});

export type UploadQueryInput = z.infer<typeof uploadQuerySchema>;
export type ListAssetsQueryInput = z.infer<typeof listAssetsQuerySchema>;
