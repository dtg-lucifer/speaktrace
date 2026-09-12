import { configManager } from "~/config";
import { uploadToCloudinary } from "~/lib/cloudinary";
import { publishMediaUploaded } from "~/lib/events";
import { SystemSettingsService } from "~/modules/system/system_settings.service";
import { createDebugProxy } from "~/shared/logging";
import { jobsCreatedTotal, tokensDeductedTotal } from "~/shared/metrics/prometheus";
import {
	FileTooLargeError,
	InsufficientCreditsError,
	MediaAssetNotFoundError,
	ProcessingJobNotFoundError,
	UnsupportedFileTypeError,
} from "./uploads.errors";
import type { IUploadsRepository, MediaAssetRow, ProcessingJobRow } from "./uploads.repository";
import type { JobOptions, MediaAsset, ProcessingJob, UploadMediaResponse } from "./uploads.types";

// ─── Mime type sets ──────────────────────────────────────────────────────────

const AUDIO_MIME_TYPES = new Set([
	"audio/mpeg",
	"audio/mp3",
	"audio/wav",
	"audio/x-wav",
	"audio/wave",
	"audio/m4a",
	"audio/x-m4a",
	"audio/aac",
	"audio/ogg",
	"audio/flac",
	"audio/x-flac",
]);

const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/webm", "video/mpeg"]);

// ─── Row → domain mappers ────────────────────────────────────────────────────

function toMediaAsset(row: MediaAssetRow): MediaAsset {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		projectId: row.project_id,
		uploadedBy: row.uploaded_by,
		originalFilename: row.original_filename,
		mimeType: row.mime_type,
		fileSizeBytes: row.file_size_bytes,
		durationSeconds: row.duration_seconds,
		checksum: row.checksum,
		storageProvider: row.storage_provider,
		storagePublicId: row.storage_public_id,
		storageUrl: row.storage_url,
		storageResourceType: row.storage_resource_type,
		status: row.status,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toProcessingJob(row: ProcessingJobRow): ProcessingJob {
	return {
		id: row.id,
		tenantId: row.tenant_id,
		projectId: row.project_id,
		mediaAssetId: row.media_asset_id,
		createdBy: row.created_by,
		status: row.status,
		currentStage: row.current_stage,
		progressPct: row.progress_pct,
		errorMessage: row.error_message,
		errorStage: row.error_stage,
		options: row.options,
		correlationId: row.correlation_id,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ─── Service Interface ───────────────────────────────────────────────────────

export interface IUploadsService {
	uploadMedia(
		userId: string,
		file: Express.Multer.File,
		opts: {
			projectId?: string;
			jobOptions: JobOptions;
			tenantId?: string;
		},
	): Promise<UploadMediaResponse>;
	getMediaAsset(assetId: string, userId: string): Promise<MediaAsset>;
	listMediaAssets(userId: string, opts: { limit: number; offset: number }): Promise<{ assets: MediaAsset[]; total: number }>;
	getJob(jobId: string, userId: string): Promise<ProcessingJob>;
	listJobs(userId: string, opts: { limit: number; offset: number }): Promise<{ jobs: ProcessingJob[]; total: number }>;
	submitSpeakerMappings(jobId: string, userId: string, mappings: Record<string, string>): Promise<void>;
	getJobDetails(jobId: string, userId: string): Promise<{
		job: ProcessingJob;
		mediaAsset: MediaAsset;
		speakers: unknown[];
		transcripts: unknown[];
	}>;
	renameJob(jobId: string, newFilename: string, userId: string): Promise<{ success: boolean; filename: string }>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class UploadsService implements IUploadsService {
	private readonly settingsService = new SystemSettingsService();

	constructor(private readonly repo: IUploadsRepository) {}

	/**
	 * Full upload flow:
	 *  1. Validate file size + mime type
	 *  2. Calculate required job credits & verify/deduct balance
	 *  3. Stream to Cloudinary
	 *  4. Persist media_asset row
	 *  5. Create processing_job row (status = UPLOADED)
	 *  6. Publish media.uploaded → RabbitMQ + internal event bus
	 */
	async uploadMedia(
		userId: string,
		file: Express.Multer.File,
		opts: {
			projectId?: string;
			jobOptions: JobOptions;
			tenantId?: string;
		},
	): Promise<UploadMediaResponse> {
		const cloudinaryConfig = configManager.getCloudinaryConfig();

		// 1. Validate file size
		const maxBytes = cloudinaryConfig.max_file_size_mb * 1024 * 1024;
		if (file.size > maxBytes) {
			throw new FileTooLargeError(cloudinaryConfig.max_file_size_mb);
		}

		// 2. Validate mime type
		const isAudio = AUDIO_MIME_TYPES.has(file.mimetype);
		const isVideo = VIDEO_MIME_TYPES.has(file.mimetype);

		if (!(isAudio || isVideo)) {
			throw new UnsupportedFileTypeError(file.mimetype, [...AUDIO_MIME_TYPES, ...VIDEO_MIME_TYPES]);
		}

		// 3. Upload to Cloudinary
		const resourceType = isVideo ? "video" : "raw";
		const folder = `speaktrace/${opts.tenantId ?? "public"}/${userId}`;

		const uploadResult = await uploadToCloudinary(file.buffer, {
			folder,
			resourceType,
			originalFilename: file.originalname,
		});

		// 4. Calculate required credit cost based on duration & selected job options
		const costBreakdown = await this.settingsService.calculateJobCost({
			durationSeconds: uploadResult.duration ?? 60,
			options: opts.jobOptions as any,
		});

		// 5. Persist media asset
		const assetRow = await this.repo.createMediaAsset({
			tenantId: opts.tenantId ?? null,
			projectId: opts.projectId ?? null,
			uploadedBy: userId,
			originalFilename: file.originalname,
			mimeType: file.mimetype,
			fileSizeBytes: file.size,
			storagePublicId: uploadResult.publicId,
			storageUrl: uploadResult.secureUrl,
			storageResourceType: uploadResult.resourceType,
			durationSeconds: uploadResult.duration,
		});

		// 6. Create processing job
		const jobRow = await this.repo.createProcessingJob({
			tenantId: opts.tenantId ?? null,
			projectId: opts.projectId ?? null,
			mediaAssetId: assetRow.id,
			createdBy: userId,
			options: opts.jobOptions,
		});

		// 7. Deduct credits atomically
		try {
			await this.settingsService.deductJobCredits(userId, costBreakdown.totalCredits, jobRow.id);
			tokensDeductedTotal.inc(costBreakdown.totalCredits);
			jobsCreatedTotal.inc({ mime_type: assetRow.mime_type });
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (errorMsg.includes("INSUFFICIENT_CREDITS")) {
				throw new InsufficientCreditsError(costBreakdown.totalCredits, 0);
			}
			throw err;
		}

		// 8. Publish media.uploaded event (RabbitMQ + internal bus)
		publishMediaUploaded({
			jobId: jobRow.id,
			mediaAssetId: assetRow.id,
			tenantId: jobRow.tenant_id,
			projectId: jobRow.project_id,
			correlationId: jobRow.correlation_id,
			storageUrl: assetRow.storage_url,
			mimeType: assetRow.mime_type,
			options: jobRow.options,
		});

		return {
			mediaAsset: toMediaAsset(assetRow),
			job: toProcessingJob(jobRow),
		};
	}

	async getMediaAsset(assetId: string, userId: string): Promise<MediaAsset> {
		const row = await this.repo.findMediaAssetById(assetId, userId);
		if (!row) throw new MediaAssetNotFoundError();
		return toMediaAsset(row);
	}

	async listMediaAssets(userId: string, opts: { limit: number; offset: number }): Promise<{ assets: MediaAsset[]; total: number }> {
		const result = await this.repo.listMediaAssets(userId, opts);
		return {
			assets: result.assets.map(toMediaAsset),
			total: result.total,
		};
	}

	async getJob(jobId: string, userId: string): Promise<ProcessingJob> {
		const row = await this.repo.findJobById(jobId, userId);
		if (!row) throw new ProcessingJobNotFoundError();
		return toProcessingJob(row);
	}

	async listJobs(userId: string, opts: { limit: number; offset: number }): Promise<{ jobs: ProcessingJob[]; total: number }> {
		const result = await this.repo.listJobsForUser(userId, opts);
		return {
			jobs: result.jobs.map(toProcessingJob),
			total: result.total,
		};
	}

	async submitSpeakerMappings(jobId: string, userId: string, mappings: Record<string, string>): Promise<void> {
		const job = await this.repo.findJobById(jobId, userId);
		if (!job) throw new ProcessingJobNotFoundError();

		// Save names to database
		for (const [tag, name] of Object.entries(mappings)) {
			await this.repo.updateSpeakerMapping(jobId, tag, name);
		}

		// Update job status to TRANSCRIPTION_IN_PROGRESS
		await this.repo.updateJobStatus(jobId, "TRANSCRIPTION_IN_PROGRESS", {
			currentStage: "TRANSCRIPTION_IN_PROGRESS",
			progressPct: 70,
		});

		// Publish event to resume worker
		const { publishSpeakerMappingSubmitted } = await import("~/lib/events");
		publishSpeakerMappingSubmitted({
			jobId,
			correlationId: job.correlation_id,
			tenantId: job.tenant_id,
			projectId: job.project_id,
			mappings,
			exportFormat: (job.options as Record<string, string>)?.export_format ?? "vtt",
			customTemplate: (job.options as Record<string, string>)?.custom_template,
		});
	}

	async getJobDetails(jobId: string, userId: string): Promise<{
		job: ProcessingJob;
		mediaAsset: MediaAsset;
		speakers: unknown[];
		transcripts: unknown[];
	}> {
		const jobRow = await this.repo.findJobById(jobId, userId);
		if (!jobRow) throw new ProcessingJobNotFoundError();

		const assetRow = await this.repo.findMediaAssetById(jobRow.media_asset_id, userId);
		if (!assetRow) throw new MediaAssetNotFoundError();

		const [speakers, transcripts] = await Promise.all([
			this.repo.getJobSpeakers(jobId),
			this.repo.getJobTranscripts(jobId),
		]);

		return {
			job: toProcessingJob(jobRow),
			mediaAsset: toMediaAsset(assetRow),
			speakers,
			transcripts,
		};
	}

	async renameJob(jobId: string, newFilename: string, userId: string): Promise<{ success: boolean; filename: string }> {
		if (!newFilename || newFilename.trim().length === 0) {
			throw new Error("Filename cannot be empty");
		}
		const success = await this.repo.renameMediaAssetByJobId(jobId, newFilename.trim(), userId);
		if (!success) {
			throw new Error("Recording not found or unauthorized");
		}
		return { success: true, filename: newFilename.trim() };
	}

	static withDebug(repo: IUploadsRepository): IUploadsService {
		return createDebugProxy(new UploadsService(repo), "UploadsService");
	}
}

