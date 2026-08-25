import { z } from "zod";
import { registry } from "~/config/openapi";

const MediaAssetSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string().uuid().nullable(),
	projectId: z.string().uuid().nullable(),
	uploadedBy: z.string().uuid(),
	originalFilename: z.string(),
	mimeType: z.string(),
	fileSizeBytes: z.number(),
	durationSeconds: z.number().nullable(),
	storageProvider: z.string(),
	storagePublicId: z.string(),
	storageUrl: z.string(),
	storageResourceType: z.string(),
	status: z.enum(["uploaded", "validated", "failed_validation"]),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const ProcessingJobSchema = z.object({
	id: z.string().uuid(),
	tenantId: z.string().uuid(),
	mediaAssetId: z.string().uuid(),
	createdBy: z.string().uuid(),
	status: z.enum([
		"UPLOADED",
		"MEDIA_VALIDATED",
		"AUDIO_EXTRACTED",
		"DIARIZATION_DONE",
		"AWAITING_SPEAKER_MAPPING",
		"TRANSCRIPTION_IN_PROGRESS",
		"ENRICHMENT_IN_PROGRESS",
		"POSTPROCESSING_IN_PROGRESS",
		"RAG_INDEXING_IN_PROGRESS",
		"COMPLETED",
		"FAILED",
	]),
	progressPct: z.number().min(0).max(100),
	options: z.record(z.string(), z.unknown()),
	correlationId: z.string().uuid(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

registry.registerPath({
	method: "post",
	path: "/uploads",
	summary: "Upload a media file (audio or video)",
	description: "Accepts a multipart/form-data request with a single `file` field. Uploads to Cloudinary and creates a processing job.",
	tags: ["Uploads"],
	security: [{ BearerAuth: [] }],
	request: {
		query: z.object({
			projectId: z.string().uuid().optional().openapi({ description: "Optional project ID" }),
			emotionTagging: z.string().optional().openapi({ description: "Enable emotion tagging (true/false)" }),
			punctuation: z.string().optional().openapi({ description: "Enable punctuation (true/false, default true)" }),
			language: z.string().optional().openapi({ description: "Language code (default: en)" }),
		}),
	},
	responses: {
		201: {
			description: "File uploaded and processing job created",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						message: z.string(),
						data: z.object({
							mediaAsset: MediaAssetSchema,
							job: ProcessingJobSchema,
						}),
					}),
				},
			},
		},
		400: { description: "Bad request (missing file, unsupported type, too large)" },
		401: { description: "Unauthorized" },
	},
});

registry.registerPath({
	method: "get",
	path: "/uploads",
	summary: "List media assets",
	tags: ["Uploads"],
	security: [{ BearerAuth: [] }],
	request: {
		query: z.object({
			limit: z.string().optional().openapi({ description: "Max results (default 20)" }),
			offset: z.string().optional().openapi({ description: "Pagination offset" }),
		}),
	},
	responses: {
		200: {
			description: "List of media assets",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						data: z.object({
							assets: z.array(MediaAssetSchema),
							total: z.number(),
						}),
					}),
				},
			},
		},
		401: { description: "Unauthorized" },
	},
});

registry.registerPath({
	method: "get",
	path: "/uploads/{assetId}",
	summary: "Get a media asset by ID",
	tags: ["Uploads"],
	security: [{ BearerAuth: [] }],
	request: {
		params: z.object({ assetId: z.string().uuid() }),
	},
	responses: {
		200: {
			description: "Media asset",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						data: z.object({ asset: MediaAssetSchema }),
					}),
				},
			},
		},
		401: { description: "Unauthorized" },
		404: { description: "Not found" },
	},
});

registry.registerPath({
	method: "get",
	path: "/uploads/jobs",
	summary: "List processing jobs",
	tags: ["Uploads"],
	security: [{ BearerAuth: [] }],
	request: {
		query: z.object({
			limit: z.string().optional(),
			offset: z.string().optional(),
		}),
	},
	responses: {
		200: {
			description: "List of processing jobs",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						data: z.object({
							jobs: z.array(ProcessingJobSchema),
							total: z.number(),
						}),
					}),
				},
			},
		},
		401: { description: "Unauthorized" },
	},
});

registry.registerPath({
	method: "get",
	path: "/uploads/jobs/{jobId}",
	summary: "Get a processing job by ID",
	tags: ["Uploads"],
	security: [{ BearerAuth: [] }],
	request: {
		params: z.object({ jobId: z.string().uuid() }),
	},
	responses: {
		200: {
			description: "Processing job",
			content: {
				"application/json": {
					schema: z.object({
						success: z.boolean(),
						data: z.object({ job: ProcessingJobSchema }),
					}),
				},
			},
		},
		401: { description: "Unauthorized" },
		404: { description: "Not found" },
	},
});
