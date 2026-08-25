import "express-serve-static-core";

declare global {
	namespace Express {
		interface Request {
			user?: {
				id: string;
				email: string;
				role?: string;
				tenantId?: string;
			};
			requestId?: string;
		}
	}
}
