import type { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { env } from "~/config/env";
import { errorResponse } from "../utils/response";
import { log } from "./logger.middleware";

export interface AuthRequest extends Request {
	user?: {
		id: string;
		email: string;
		tenantId?: string;
	};
	token?: string;
}

interface TokenPayload {
	id: string;
	email: string;
	tenantId?: string;
}

const parseTokenPayload = (decoded: string | jwt.JwtPayload): TokenPayload | null => {
	if (typeof decoded === "string") {
		return null;
	}

	const id = decoded.id;
	const email = decoded.email;
	const tenantId = decoded.tenantId;

	if (typeof id !== "string" || typeof email !== "string") {
		return null;
	}

	return { id, email, tenantId };
};

export const verifyToken = (token: string): TokenPayload | null => {
	try {
		const decoded = jwt.verify(token, env.JWT_SECRET);
		return parseTokenPayload(decoded);
	} catch (_) {
		return null;
	}
};

export const generateToken = (payload: object, expiresIn: string = "24h"): string => {
	return jwt.sign(payload, env.JWT_SECRET, {
		expiresIn: expiresIn as string,
	} as jwt.SignOptions);
};

export const generateRefreshToken = (payload: object): string => {
	return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
		expiresIn: "30d",
	} as jwt.SignOptions);
};

export const verifyRefreshToken = (token: string): TokenPayload | null => {
	try {
		const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
		return parseTokenPayload(decoded);
	} catch (_) {
		return null;
	}
};

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
	try {
		const authHeader = req.headers.authorization;

		if (!authHeader?.startsWith("Bearer ")) {
			return errorResponse(res, "Missing or invalid authorization header", 401);
		}

		const token = authHeader.substring(7);
		const decoded = verifyToken(token);

		if (!decoded) {
			return errorResponse(res, "Invalid or expired token", 401);
		}

		req.user = decoded;
		res.locals.user = decoded;
		req.token = token;
		next();
	} catch (error) {
		log.error("Authentication error:", error);
		return errorResponse(res, "Authentication failed", 401);
	}
};

export const optionalAuth = (req: AuthRequest, _res: Response, next: NextFunction) => {
	try {
		const authHeader = req.headers.authorization;

		if (authHeader?.startsWith("Bearer ")) {
			const token = authHeader.substring(7);
			const decoded = verifyToken(token);

			if (decoded) {
				req.user = decoded;
				req.token = token;
			}
		}

		next();
	} catch (error) {
		log.error("Optional authentication error:", error);
		next();
	}
};
