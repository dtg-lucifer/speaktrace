import { Router } from "express";
import { authenticate } from "~/shared/middlewares/jwt.middleware";
import { ProjectsController } from "./projects.controller";

export function createProjectsRouter(): Router {
	const router = Router();
	const controller = new ProjectsController();

	router.use(authenticate);

	router.post("/", controller.createProject);
	router.get("/", controller.listProjects);
	router.get("/:id", controller.getProject);
	router.delete("/:id", controller.deleteProject);

	return router;
}

export default createProjectsRouter();
