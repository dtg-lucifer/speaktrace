import type { Request, Response } from "express";
import { ProjectsService } from "./projects.service";

export class ProjectsController {
	constructor(private readonly service: ProjectsService = new ProjectsService()) {}

	createProject = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}
			const { name, description } = req.body;
			const project = await this.service.createProject(userId, name, description);
			res.status(201).json({ success: true, data: project });
		} catch (error) {
			res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to create project" });
		}
	};

	listProjects = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}
			const projects = await this.service.listProjects(userId);
			res.json({ success: true, data: projects });
		} catch (error) {
			res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Failed to list projects" });
		}
	};

	getProject = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}
			const id = req.params.id as string;
			const details = await this.service.getProjectDetails(id, userId);
			res.json({ success: true, data: details });
		} catch (error) {
			res.status(404).json({ success: false, error: error instanceof Error ? error.message : "Project not found" });
		}
	};

	deleteProject = async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.user?.id;
			if (!userId) {
				res.status(401).json({ success: false, error: "Unauthorized" });
				return;
			}
			const id = req.params.id as string;
			await this.service.deleteProject(id, userId);
			res.json({ success: true, message: "Project deleted successfully" });
		} catch (error) {
			res.status(400).json({ success: false, error: error instanceof Error ? error.message : "Failed to delete project" });
		}
	};
}
