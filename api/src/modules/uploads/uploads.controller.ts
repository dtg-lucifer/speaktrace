import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { BadRequestError, ErrorCode } from "~/shared/errors";
import { asyncHandler } from "~/shared/utils/asyncHandler";
import { createdResponse, successResponse } from "~/shared/utils/response";
import type { IUploadsService } from "./uploads.service";
import type { UploadQueryInput } from "./uploads.validator";

export class UploadsController {
	constructor(private readonly service: IUploadsService) {}

	// ── POST /uploads ────────────────────────────────────────────────────────

	/**
	 * Accepts multipart/form-data with a single `file` field.
	 * Validates, uploads to Cloudinary, creates a processing job,
	 * and publishes media.uploaded to RabbitMQ.
	 */
	uploadMedia = asyncHandler(async (req: Request, res: Response) => {
		const userId = req.user?.id;
		if (!userId) {
			throw new BadRequestError("User not authenticated", ErrorCode.UNAUTHORIZED);
		}

		const file = req.file;
		if (!file) {
			throw new BadRequestError("No file provided. Send a multipart/form-data request with field 'file'.", ErrorCode.BAD_REQUEST);
		}

		const query = req.query as unknown as UploadQueryInput;

		const result = await this.service.uploadMedia(userId, file, {
			projectId: query.projectId,
			tenantId: req.user?.tenantId,
			jobOptions: {
				emotionTagging: query.emotionTagging,
				punctuation: query.punctuation,
				language: query.language,
			},
		});

		createdResponse(res, result, "File uploaded and processing job created");
	});

	// ── GET /uploads ─────────────────────────────────────────────────────────

	listAssets = asyncHandler(async (req: Request, res: Response) => {
		const userId = req.user?.id;
		if (!userId) {
			throw new BadRequestError("User not authenticated", ErrorCode.UNAUTHORIZED);
		}

		const limit = Math.min(Number(req.query.limit ?? 20), 100);
		const offset = Number(req.query.offset ?? 0);

		const result = await this.service.listMediaAssets(userId, {
			limit,
			offset,
		});
		successResponse(res, result, "Media assets retrieved", 200, {
			limit,
			offset,
			total: result.total,
		});
	});

	// ── GET /uploads/:assetId ────────────────────────────────────────────────

	getAsset = asyncHandler(async (req: Request, res: Response) => {
		const userId = req.user?.id;
		if (!userId) {
			throw new BadRequestError("User not authenticated", ErrorCode.UNAUTHORIZED);
		}

		const { assetId } = req.params as { assetId: string };
		const asset = await this.service.getMediaAsset(assetId, userId);
		successResponse(res, { asset }, "Media asset retrieved");
	});

	// ── GET /uploads/jobs ────────────────────────────────────────────────────

	listJobs = asyncHandler(async (req: Request, res: Response) => {
		const userId = req.user?.id;
		if (!userId) {
			throw new BadRequestError("User not authenticated", ErrorCode.UNAUTHORIZED);
		}

		const limit = Math.min(Number(req.query.limit ?? 20), 100);
		const offset = Number(req.query.offset ?? 0);

		const result = await this.service.listJobs(userId, { limit, offset });
		successResponse(res, result, "Processing jobs retrieved", 200, {
			limit,
			offset,
			total: result.total,
		});
	});

	// ── GET /uploads/jobs/:jobId ─────────────────────────────────────────────

	getJob = asyncHandler(async (req: Request, res: Response) => {
		const userId = req.user?.id;
		if (!userId) {
			throw new BadRequestError("User not authenticated", ErrorCode.UNAUTHORIZED);
		}

		const { jobId } = req.params as { jobId: string };
		const job = await this.service.getJob(jobId, userId);
		successResponse(res, { job }, "Processing job retrieved");
	});

	// ── Multer error handler ─────────────────────────────────────────────────

	/**
	 * Must be registered as a 4-argument Express error handler directly after
	 * the multer middleware in the route definition.
	 */
	static handleMulterError(err: Error, _req: Request, _res: Response, next: NextFunction): void {
		if (err instanceof multer.MulterError) {
			if (err.code === "LIMIT_FILE_SIZE") {
				next(new BadRequestError("File is too large. Check the maximum allowed size.", ErrorCode.BAD_REQUEST));
				return;
			}
			next(new BadRequestError(`Upload error: ${err.message}`, ErrorCode.BAD_REQUEST));
			return;
		}
		// Not a multer error — pass through to global error handler
		next(err);
	}
}
