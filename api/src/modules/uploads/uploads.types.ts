export type MediaAssetStatus = "uploaded" | "validated" | "failed_validation";

export type ProcessingJobStatus =
	| "UPLOADED"
	| "MEDIA_VALIDATED"
	| "AUDIO_EXTRACTED"
	| "DIARIZATION_DONE"
	| "AWAITING_SPEAKER_MAPPING"
	| "TRANSCRIPTION_IN_PROGRESS"
	| "ENRICHMENT_IN_PROGRESS"
	| "POSTPROCESSING_IN_PROGRESS"
	| "RAG_INDEXING_IN_PROGRESS"
	| "COMPLETED"
	| "FAILED";

export interface MediaAsset {
	id: string;
	tenantId: string | null;
	projectId: string | null;
	uploadedBy: string;
	originalFilename: string;
	mimeType: string;
	fileSizeBytes: number;
	durationSeconds: number | null;
	checksum: string | null;
	storageProvider: string;
	storagePublicId: string;
	storageUrl: string;
	storageResourceType: string;
	status: MediaAssetStatus;
	createdAt: Date;
	updatedAt: Date;
}

export interface ProcessingJob {
	id: string;
	tenantId: string;
	projectId: string | null;
	mediaAssetId: string;
	createdBy: string;
	status: ProcessingJobStatus;
	currentStage: string | null;
	progressPct: number;
	errorMessage: string | null;
	errorStage: string | null;
	options: Record<string, unknown>;
	correlationId: string;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface UploadMediaResponse {
	mediaAsset: MediaAsset;
	job: ProcessingJob;
}

export interface JobOptions {
	emotionTagging?: boolean;
	punctuation?: boolean;
	language?: string;
}
