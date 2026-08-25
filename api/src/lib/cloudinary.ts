/**
 * Cloudinary client singleton.
 *
 * Reads CLOUDINARY_URL from the environment (format:
 *   cloudinary://<api_key>:<api_secret>@<cloud_name>)
 * and configures the v2 SDK once at startup.
 */
// biome-ignore lint/correctness/noUnresolvedImports: cloudinary package lacks exports field but resolves correctly at runtime
import { v2 as cloudinary } from "cloudinary";
import { logger } from "~/shared/logging";

let initialized = false;

export function initCloudinary(): void {
	if (initialized) return;

	const cloudinaryUrl = Bun.env.CLOUDINARY_URL;
	if (!cloudinaryUrl) {
		logger.warn("[CLOUDINARY] CLOUDINARY_URL not set — uploads will fail");
		return;
	}

	// The SDK auto-configures from CLOUDINARY_URL env var, but we call
	// config() explicitly so we can log the cloud name.
	cloudinary.config({ cloudinary_url: cloudinaryUrl });

	const cfg = cloudinary.config();
	logger.info(`[CLOUDINARY] Configured for cloud: ${cfg.cloud_name}`);
	initialized = true;
}

export { cloudinary };

export interface CloudinaryUploadResult {
	publicId: string;
	url: string;
	secureUrl: string;
	resourceType: string;
	format: string;
	bytes: number;
	duration?: number;
	width?: number;
	height?: number;
	originalFilename: string;
}

/**
 * Upload a file buffer to Cloudinary.
 *
 * @param buffer     Raw file bytes
 * @param options    Upload options (folder, resource_type, etc.)
 */
export async function uploadToCloudinary(
	buffer: Buffer,
	options: {
		folder: string;
		resourceType: "video" | "raw" | "image" | "auto";
		publicId?: string;
		originalFilename?: string;
	},
): Promise<CloudinaryUploadResult> {
	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: options.folder,
				resource_type: options.resourceType,
				public_id: options.publicId,
				use_filename: true,
				unique_filename: true,
				overwrite: false,
				// Store original filename in context
				context: options.originalFilename ? `original_filename=${options.originalFilename}` : undefined,
			},
			(error, result) => {
				if (error || !result) {
					reject(error ?? new Error("Cloudinary upload returned no result"));
					return;
				}

				resolve({
					publicId: result.public_id,
					url: result.url,
					secureUrl: result.secure_url,
					resourceType: result.resource_type,
					format: result.format,
					bytes: result.bytes,
					duration: (result as Record<string, unknown>).duration as number | undefined,
					width: result.width,
					height: result.height,
					originalFilename: options.originalFilename ?? result.original_filename ?? "",
				});
			},
		);

		uploadStream.end(buffer);
	});
}

/**
 * Delete a resource from Cloudinary by public_id.
 */
export async function deleteFromCloudinary(publicId: string, resourceType: "video" | "raw" | "image" = "video"): Promise<void> {
	await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
