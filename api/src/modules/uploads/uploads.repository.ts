import { z } from "zod";
import { BaseRepository } from "~/shared/database/repositories";
import type { JobOptions, MediaAssetStatus, ProcessingJobStatus } from "./uploads.types";

// ─── Input Schema ───────────────────────────────────────────────────────────
export type CreateMediaAssetInputSchema = {
	tenantId: string | null;
	projectId: string | null;
	uploadedBy: string;
	originalFilename: string;
	mimeType: string;
	fileSizeBytes: number;
	storagePublicId: string;
	storageUrl: string;
	storageResourceType: string;
	checksum?: string;
	durationSeconds?: number;
};

// ─── Row schemas ────────────────────────────────────────────────────────────

const MediaAssetRowSchema = z.object({
	id: z.string().uuid(),
	tenant_id: z.string().uuid().nullable(),
	project_id: z.string().uuid().nullable(),
	uploaded_by: z.string().uuid(),
	original_filename: z.string(),
	mime_type: z.string(),
	file_size_bytes: z.coerce.number(),
	duration_seconds: z.coerce.number().nullable(),
	checksum: z.string().nullable(),
	storage_provider: z.string(),
	storage_public_id: z.string(),
	storage_url: z.string(),
	storage_resource_type: z.string(),
	status: z.enum(["uploaded", "validated", "failed_validation"]),
	created_at: z.coerce.date(),
	updated_at: z.coerce.date(),
});

const ProcessingJobRowSchema = z.object({
	id: z.string().uuid(),
	tenant_id: z.string().uuid(),
	project_id: z.string().uuid().nullable(),
	media_asset_id: z.string().uuid(),
	created_by: z.string().uuid(),
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
	current_stage: z.string().nullable(),
	progress_pct: z.coerce.number(),
	error_message: z.string().nullable(),
	error_stage: z.string().nullable(),
	options: z.record(z.string(), z.unknown()),
	correlation_id: z.string().uuid(),
	started_at: z.coerce.date().nullable(),
	completed_at: z.coerce.date().nullable(),
	created_at: z.coerce.date(),
	updated_at: z.coerce.date(),
});

export type MediaAssetRow = z.infer<typeof MediaAssetRowSchema>;
export type ProcessingJobRow = z.infer<typeof ProcessingJobRowSchema>;

export interface IUploadsRepository {
	createMediaAsset(input: CreateMediaAssetInputSchema): Promise<MediaAssetRow>;
	findMediaAssetById(id: string, userId: string): Promise<MediaAssetRow | null>;
	listMediaAssets(userId: string, opts: { limit: number; offset: number }): Promise<{ assets: MediaAssetRow[]; total: number }>;
	updateMediaAssetStatus(id: string, status: MediaAssetStatus): Promise<void>;
	createProcessingJob(input: {
		tenantId: string;
		projectId: string | null;
		mediaAssetId: string;
		createdBy: string;
		options: JobOptions;
	}): Promise<ProcessingJobRow>;
	findJobById(id: string, userId: string): Promise<ProcessingJobRow | null>;
	listJobsForUser(userId: string, opts: { limit: number; offset: number }): Promise<{ jobs: ProcessingJobRow[]; total: number }>;
	findJobByMediaAssetId(mediaAssetId: string, userId: string): Promise<ProcessingJobRow | null>;
	updateJobStatus(
		id: string,
		status: ProcessingJobStatus,
		extra?: {
			currentStage?: string;
			progressPct?: number;
			errorMessage?: string;
			errorStage?: string;
		},
	): Promise<void>;
}

// ─── Repository ─────────────────────────────────────────────────────────────

export class UploadsRepository extends BaseRepository implements IUploadsRepository {
	// ── Media Assets ──────────────────────────────────────────────────────

	async createMediaAsset(input: CreateMediaAssetInputSchema): Promise<MediaAssetRow> {
		const rows = await this.db.query<MediaAssetRow>(
			`INSERT INTO media_assets (
                tenant_id, project_id, uploaded_by,
                original_filename, mime_type, file_size_bytes,
                storage_public_id, storage_url, storage_resource_type,
                checksum, duration_seconds
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *`,
			[
				input.tenantId,
				input.projectId,
				input.uploadedBy,
				input.originalFilename,
				input.mimeType,
				input.fileSizeBytes,
				input.storagePublicId,
				input.storageUrl,
				input.storageResourceType,
				input.checksum ?? null,
				input.durationSeconds ?? null,
			],
		);

		const row = rows[0];
		if (!row) throw new Error("Failed to create media asset");
		return MediaAssetRowSchema.parse(row);
	}

	async findMediaAssetById(id: string, userId: string): Promise<MediaAssetRow | null> {
		const rows = await this.db.query<MediaAssetRow>(`SELECT * FROM media_assets WHERE id = $1 AND uploaded_by = $2 LIMIT 1`, [
			id,
			userId,
		]);
		const row = rows[0];
		return row ? MediaAssetRowSchema.parse(row) : null;
	}

	async listMediaAssets(userId: string, opts: { limit: number; offset: number }): Promise<{ assets: MediaAssetRow[]; total: number }> {
		const [assetsResult, countResult] = await Promise.all([
			this.db.query<MediaAssetRow>(
				`SELECT * FROM media_assets
                 WHERE uploaded_by = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
				[userId, opts.limit, opts.offset],
			),
			this.db.query<{ count: string }>(`SELECT COUNT(*) as count FROM media_assets WHERE uploaded_by = $1`, [userId]),
		]);

		return {
			assets: assetsResult.map((r) => MediaAssetRowSchema.parse(r)),
			total: Number(countResult[0]?.count ?? 0),
		};
	}

	async updateMediaAssetStatus(id: string, status: MediaAssetStatus): Promise<void> {
		await this.db.query(`UPDATE media_assets SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
	}

	// ── Processing Jobs ───────────────────────────────────────────────────

	async createProcessingJob(input: {
		tenantId: string;
		projectId: string | null;
		mediaAssetId: string;
		createdBy: string;
		options: JobOptions;
	}): Promise<ProcessingJobRow> {
		const rows = await this.db.query<ProcessingJobRow>(
			`INSERT INTO processing_jobs (
                tenant_id, project_id, media_asset_id, created_by, options
            ) VALUES ($1,$2,$3,$4,$5::jsonb)
            RETURNING *`,
			[input.tenantId, input.projectId, input.mediaAssetId, input.createdBy, JSON.stringify(input.options)],
		);

		const row = rows[0];
		if (!row) throw new Error("Failed to create processing job");
		return ProcessingJobRowSchema.parse(row);
	}

	async findJobById(id: string, userId: string): Promise<ProcessingJobRow | null> {
		const rows = await this.db.query<ProcessingJobRow>(`SELECT * FROM processing_jobs WHERE id = $1 AND created_by = $2 LIMIT 1`, [
			id,
			userId,
		]);
		const row = rows[0];
		return row ? ProcessingJobRowSchema.parse(row) : null;
	}

	async listJobsForUser(userId: string, opts: { limit: number; offset: number }): Promise<{ jobs: ProcessingJobRow[]; total: number }> {
		const [jobsResult, countResult] = await Promise.all([
			this.db.query<ProcessingJobRow>(
				`SELECT * FROM processing_jobs
                 WHERE created_by = $1
                 ORDER BY created_at DESC
                 LIMIT $2 OFFSET $3`,
				[userId, opts.limit, opts.offset],
			),
			this.db.query<{ count: string }>(`SELECT COUNT(*) as count FROM processing_jobs WHERE created_by = $1`, [userId]),
		]);

		return {
			jobs: jobsResult.map((r) => ProcessingJobRowSchema.parse(r)),
			total: Number(countResult[0]?.count ?? 0),
		};
	}

	async findJobByMediaAssetId(mediaAssetId: string, userId: string): Promise<ProcessingJobRow | null> {
		const rows = await this.db.query<ProcessingJobRow>(
			`SELECT * FROM processing_jobs
             WHERE media_asset_id = $1 AND created_by = $2
             LIMIT 1`,
			[mediaAssetId, userId],
		);
		const row = rows[0];
		return row ? ProcessingJobRowSchema.parse(row) : null;
	}

	async updateJobStatus(
		id: string,
		status: ProcessingJobStatus,
		extra?: {
			currentStage?: string;
			progressPct?: number;
			errorMessage?: string;
			errorStage?: string;
		},
	): Promise<void> {
		await this.db.query(
			`UPDATE processing_jobs
              SET status = $1,
                  current_stage = COALESCE($2, current_stage),
                  progress_pct = COALESCE($3, progress_pct),
                  error_message = COALESCE($4, error_message),
                  error_stage = COALESCE($5, error_stage),
                  updated_at = NOW()
              WHERE id = $6`,
			[status, extra?.currentStage ?? null, extra?.progressPct ?? null, extra?.errorMessage ?? null, extra?.errorStage ?? null, id],
		);
	}
}
