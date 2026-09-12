import { randomUUID } from "node:crypto";
import { env } from "~/config/env";
import { rabbitMQ, type SpeakTraceEvent } from "~/lib/rabbitmq";
import { eventBus } from "~/shared/events";
import { logger } from "~/shared/logging";
import { getQueueProvider } from "~/shared/queue";

// ─── Generic publish helper ──────────────────────────────────────────────────

interface EnvelopeParams {
	eventType: string;
	jobId: string;
	correlationId: string;
	tenantId: string | null;
	projectId: string | null;
}

function buildEnvelope<P>(params: EnvelopeParams, payload: P): SpeakTraceEvent<P> {
	return {
		event_id: randomUUID(),
		event_type: params.eventType,
		occurred_at: new Date().toISOString(),
		tenant_id: params.tenantId,
		project_id: params.projectId,
		job_id: params.jobId,
		correlation_id: params.correlationId,
		idempotency_key: randomUUID(),
		payload,
	};
}

// ─── Specific event publishers ───────────────────────────────────────────────

/**
 * Published by the API immediately after a processing job is created.
 * Consumed by background workers to start processing.
 */
export function publishMediaUploaded(params: {
	jobId: string;
	mediaAssetId: string;
	tenantId: string | null;
	projectId: string | null;
	correlationId: string;
	storageUrl: string;
	mimeType: string;
	options: Record<string, unknown>;
}): void {
	// 1. Internal bus (Socket.IO listeners, SSE manager, etc.)
	eventBus.emit("media.uploaded", params);

	// 2. Queue Dispatcher (BullMQ or RabbitMQ)
	const envelope = buildEnvelope(
		{
			eventType: "media.uploaded",
			jobId: params.jobId,
			correlationId: params.correlationId,
			tenantId: params.tenantId,
			projectId: params.projectId,
		},
		{
			media_asset_id: params.mediaAssetId,
			storage_url: params.storageUrl,
			mime_type: params.mimeType,
			options: params.options,
		},
	);

	if (env.QUEUE_PROVIDER === "bullmq") {
		const queueProvider = getQueueProvider();
		queueProvider
			.enqueue({
				queue: "media.uploaded",
				name: "media.uploaded",
				data: envelope,
				deduplicationId: params.jobId,
			})
			.catch((err) => {
				logger.error(`[EVENTS] BullMQ enqueue failed for job ${params.jobId}`, { err });
			});
		logger.info(`[EVENTS:BULLMQ] Enqueued media.uploaded job ${params.jobId}`);
	} else {
		rabbitMQ.publish("media.uploaded", envelope);
		logger.info(`[EVENTS:RABBITMQ] Published media.uploaded for job ${params.jobId}`);
	}
}

/**
 * Published by the API when a job's status/progress changes.
 * Used to push SSE updates to the browser.
 */
export function publishJobProgress(params: {
	jobId: string;
	correlationId: string;
	tenantId: string | null;
	status: string;
	progressPct: number;
	currentStage: string | null;
}): void {
	eventBus.emit("job.progress.updated", params);

	const envelope = buildEnvelope(
		{
			eventType: "job.progress.updated",
			jobId: params.jobId,
			correlationId: params.correlationId,
			tenantId: params.tenantId,
			projectId: null,
		},
		{
			status: params.status,
			progress_pct: params.progressPct,
			current_stage: params.currentStage,
		},
	);

	if (env.QUEUE_PROVIDER === "bullmq") {
		const queueProvider = getQueueProvider();
		queueProvider
			.enqueue({
				queue: "job.progress.updated",
				name: "job.progress.updated",
				data: envelope,
			})
			.catch((err) => {
				logger.error(`[EVENTS] BullMQ enqueue failed for job progress ${params.jobId}`, { err });
			});
	} else {
		rabbitMQ.publish("job.progress.updated", envelope);
	}
}

/**
 * Published when user submits speaker names for a diarized job.
 * Worker resumes transcription with user names mapped to speaker voices.
 */
export function publishSpeakerMappingSubmitted(params: {
	jobId: string;
	correlationId: string;
	tenantId: string | null;
	projectId: string | null;
	mappings: Record<string, string>;
	exportFormat?: string;
	customTemplate?: string;
}): void {
	eventBus.emit("speaker.mapping.submitted", params);

	const envelope = buildEnvelope(
		{
			eventType: "speaker.mapping.submitted",
			jobId: params.jobId,
			correlationId: params.correlationId,
			tenantId: params.tenantId,
			projectId: params.projectId,
		},
		{
			mappings: params.mappings,
			export_format: params.exportFormat ?? "vtt",
			custom_template: params.customTemplate,
			project_id: params.projectId,
		},
	);

	if (env.QUEUE_PROVIDER === "bullmq") {
		const queueProvider = getQueueProvider();
		queueProvider
			.enqueue({
				queue: "speaker.mapping.submitted",
				name: "speaker.mapping.submitted",
				data: envelope,
				deduplicationId: `map_${params.jobId}`,
			})
			.catch((err) => {
				logger.error(`[EVENTS] BullMQ enqueue failed for speaker mapping ${params.jobId}`, { err });
			});
		logger.info(`[EVENTS:BULLMQ] Enqueued speaker.mapping.submitted for job ${params.jobId}`);
	} else {
		rabbitMQ.publish("speaker.mapping.submitted", envelope);
		logger.info(`[EVENTS:RABBITMQ] Published speaker.mapping.submitted for job ${params.jobId}`);
	}
}

