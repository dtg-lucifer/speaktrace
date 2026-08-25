import type { Router } from "express";
import type { AppDependencies } from "~/shared/middlewares/locals.middleware";
import { createAuthRouter } from "./auth/auth.routes";
import { createSystemRouter } from "./system/system.routes";
import { createUploadsRouter } from "./uploads/uploads.routes";
import { createUsersRouter } from "./users/users.routes";

export function registerHttpRoutes(app: Router, apiPrefix: string, deps: AppDependencies) {
	app.use(`${apiPrefix}`, createSystemRouter({ apiPrefix, db: deps.db }));
	app.use(`${apiPrefix}/auth`, createAuthRouter());
	app.use(`${apiPrefix}/users`, createUsersRouter());
	app.use(
		`${apiPrefix}/uploads`,
		createUploadsRouter({
			repository: undefined, // uses default UploadsRepository (which will get db from request locals or DI)
		}),
	);
}
