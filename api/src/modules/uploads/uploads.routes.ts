import { Router } from "express";
import multer from "multer";
import { configManager } from "~/config";
import { authenticate } from "~/shared/middlewares/jwt.middleware";
import { validate } from "~/shared/middlewares/validation.middleware";
import { UploadsController } from "./uploads.controller";
import { type IUploadsRepository, UploadsRepository } from "./uploads.repository";
import { type IUploadsService, UploadsService } from "./uploads.service";
import { listAssetsQuerySchema, uploadQuerySchema } from "./uploads.validator";

export interface UploadsModuleDependencies {
	repository?: IUploadsRepository;
	service?: IUploadsService;
	controller?: UploadsController;
}

// Memory storage: file buffer is streamed directly to Cloudinary, never touches disk.
const ALLOWED_MIME_RE = /^(audio|video)\//;

export function createUploadsRouter(dependencies: UploadsModuleDependencies = {}) {
	const router = Router();

	const repository = dependencies.repository ?? new UploadsRepository();
	const service = dependencies.service ?? UploadsService.withDebug(repository);
	const controller = dependencies.controller ?? new UploadsController(service);

	// ─── Multer setup ────────────────────────────────────────────────────────────
	const cloudinaryConfig = configManager.getCloudinaryConfig();

	const upload = multer({
		storage: multer.memoryStorage(),
		limits: {
			fileSize: cloudinaryConfig.max_file_size_mb * 1024 * 1024,
			files: 1,
		},
		fileFilter: (_req, file, cb) => {
			if (ALLOWED_MIME_RE.test(file.mimetype)) {
				cb(null, true);
			} else {
				cb(new Error(`Unsupported file type: ${file.mimetype}`));
			}
		},
	});

	// All routes require a valid Bearer token
	router.use(authenticate);

	// POST /uploads — upload audio or video file
	router.post("/", upload.single("file"), UploadsController.handleMulterError, validate(uploadQuerySchema), controller.uploadMedia);

	// GET /uploads — list media assets (paginated)
	router.get("/", validate(listAssetsQuerySchema), controller.listAssets);

	// GET /uploads/jobs — list processing jobs (paginated)
	// NOTE: must be declared before /:assetId to avoid route shadowing
	router.get("/jobs", validate(listAssetsQuerySchema), controller.listJobs);

	// GET /uploads/jobs/:jobId — get a single processing job
	router.get("/jobs/:jobId", controller.getJob);

	// GET /uploads/:assetId — get a single media asset
	router.get("/:assetId", controller.getAsset);

	return router;
}

export default createUploadsRouter();
