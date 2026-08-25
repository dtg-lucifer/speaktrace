import type { NextFunction, Request, Response } from "express";
import { ErrorCode, UnauthorizedError } from "../errors";

/**
 * Require the authenticated user to have one of the specified roles.
 */
export function authorize(...roles: string[]) {
	return (req: Request, _res: Response, next: NextFunction) => {
		// Check if user is authenticated
		if (!(req as any).user) {
			next(new UnauthorizedError("Authentication required", ErrorCode.UNAUTHORIZED));
			return;
		}

		// Check if user has required role
		const userRole = (req as any).user.role;
		if (!(userRole && roles.includes(userRole))) {
			next(new UnauthorizedError("Insufficient permissions", ErrorCode.INSUFFICIENT_PERMISSIONS));
			return;
		}

		next();
	};
}
