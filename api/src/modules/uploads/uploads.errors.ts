import { BadRequestError, ErrorCode, NotFoundError } from "~/shared/errors";

export class FileTooLargeError extends BadRequestError {
	constructor(maxMb: number) {
		super(`File exceeds the maximum allowed size of ${maxMb} MB`, ErrorCode.BAD_REQUEST);
	}
}

export class UnsupportedFileTypeError extends BadRequestError {
	constructor(mimeType: string, allowed: string[]) {
		super(`File type "${mimeType}" is not supported. Allowed: ${allowed.join(", ")}`, ErrorCode.BAD_REQUEST);
	}
}

export class MediaAssetNotFoundError extends NotFoundError {
	constructor() {
		super("Media asset not found", ErrorCode.NOT_FOUND);
	}
}

export class ProcessingJobNotFoundError extends NotFoundError {
	constructor() {
		super("Processing job not found", ErrorCode.NOT_FOUND);
	}
}

export class InsufficientCreditsError extends BadRequestError {
	constructor(required: number, available: number) {
		super(
			`Insufficient credits: Required ${required} credits, but you have ${available} credits available. Please purchase credits or upgrade your plan.`,
			ErrorCode.BAD_REQUEST,
		);
	}
}
