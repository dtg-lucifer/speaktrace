import { env } from "~/config/env";
import { rabbitMQ, type SpeakTraceEvent } from "~/lib/rabbitmq";
import { UploadsRepository } from "~/modules/uploads/uploads.repository";
import { eventBus } from "~/shared/events";
import { logger } from "~/shared/logging";
import type { AppDependencies } from "~/shared/middlewares";
import { getQueueProvider } from "~/shared/queue";

interface MediaValidatedPayload {
	media_asset_id: string;
	storage_url: string;
	mime_type: string;
	options: Record<string, unknown>;
}

async function handleMediaValidated(event: SpeakTraceEvent<MediaValidatedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received media.validated event", {
		jobId: event.job_id,
		mediaAssetId: event.payload.media_asset_id,
	});

	try {
		const job = await uploadsRepo.findJobByMediaAssetId(event.payload.media_asset_id, event.tenant_id ?? "");

		if (!job) {
			logger.warn("[EVENT-CONSUMERS] No job found for media asset", {
				mediaAssetId: event.payload.media_asset_id,
			});
			return;
		}

		await uploadsRepo.updateJobStatus(job.id, "MEDIA_VALIDATED", {
			currentStage: "MEDIA_VALIDATED",
			progressPct: 20,
		});

		eventBus.emit("job.progress.updated", {
			jobId: job.id,
			correlationId: job.correlation_id,
			tenantId: job.tenant_id,
			status: "MEDIA_VALIDATED",
			progressPct: 20,
			currentStage: "MEDIA_VALIDATED",
		});

		logger.info("[EVENT-CONSUMERS] Updated job status to MEDIA_VALIDATED", {
			jobId: job.id,
		});
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process media.validated event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function handleAudioExtracted(event: SpeakTraceEvent<MediaValidatedPayload>, uploadsRepo: UploadsRepository) {
	logger.info("[EVENT-CONSUMERS] Received audio.extracted event", {
		jobId: event.job_id,
		mediaAssetId: event.payload.media_asset_id,
	});

	try {
		const job = await uploadsRepo.findJobByMediaAssetId(event.payload.media_asset_id, event.tenant_id ?? "");

		if (!job) {
			logger.warn("[EVENT-CONSUMERS] No job found for media asset", {
				mediaAssetId: event.payload.media_asset_id,
			});
			return;
		}

		await uploadsRepo.updateJobStatus(job.id, "AUDIO_EXTRACTED", {
			currentStage: "AUDIO_EXTRACTED",
			progressPct: 40,
		});

		eventBus.emit("job.progress.updated", {
			jobId: job.id,
			correlationId: job.correlation_id,
			tenantId: job.tenant_id,
			status: "AUDIO_EXTRACTED",
			progressPct: 40,
			currentStage: "AUDIO_EXTRACTED",
		});

		logger.info("[EVENT-CONSUMERS] Updated job status to AUDIO_EXTRACTED", {
			jobId: job.id,
		});
	} catch (error) {
		logger.error("[EVENT-CONSUMERS] Failed to process audio.extracted event", {
			jobId: event.job_id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Sets up consumers for events published by workers.
 * Dynamically uses BullMQ (Redis) or RabbitMQ (AMQP) depending on env.QUEUE_PROVIDER.
 */
export function setupWorkerEventConsumers(deps: AppDependencies): void {
	const { db } = deps;
	if (!db) {
		logger.error("[EVENT-CONSUMERS] Database not available");
		return;
	}

	const uploadsRepo = new UploadsRepository();

	if (env.QUEUE_PROVIDER === "bullmq") {
		const queueProvider = getQueueProvider();

		queueProvider
			.startWorker<SpeakTraceEvent<MediaValidatedPayload>>("media.validated", async (job) =>
				handleMediaValidated(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ media.validated worker", { err }));

		queueProvider
			.startWorker<SpeakTraceEvent<MediaValidatedPayload>>("audio.extracted", async (job) =>
				handleAudioExtracted(job.data, uploadsRepo),
			)
			.catch((err) => logger.error("[EVENT-CONSUMERS] Failed to start BullMQ audio.extracted worker", { err }));

		logger.info("[EVENT-CONSUMERS] BullMQ (Redis) worker event consumers initialized");
	} else {
		rabbitMQ
			.subscribe<MediaValidatedPayload>("media.validated", (event) => handleMediaValidated(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up media.validated consumer", error));

		rabbitMQ
			.subscribe<MediaValidatedPayload>("audio.extracted", (event) => handleAudioExtracted(event, uploadsRepo))
			.catch((error) => logger.error("[EVENT-CONSUMERS] Failed to set up audio.extracted consumer", error));

		logger.info("[EVENT-CONSUMERS] RabbitMQ (AMQP) worker event consumers initialized");
	}
}
