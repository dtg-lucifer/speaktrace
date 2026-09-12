import type { IProjectsRepository, ProjectRow } from "./projects.repository";
import { ProjectsRepository } from "./projects.repository";

export class ProjectsService {
	constructor(private readonly repo: IProjectsRepository = new ProjectsRepository()) {}

	async createProject(ownerId: string, name: string, description?: string): Promise<ProjectRow> {
		if (!name || name.trim().length === 0) {
			throw new Error("Project name is required");
		}
		return this.repo.createProject({ ownerId, name: name.trim(), description: description?.trim() });
	}

	async listProjects(ownerId: string): Promise<ProjectRow[]> {
		return this.repo.listProjectsByOwner(ownerId);
	}

	async getProjectDetails(projectId: string, ownerId: string) {
		const details = await this.repo.getProjectFilesAndJobs(projectId, ownerId);
		if (!details) {
			throw new Error("Project not found");
		}
		return details;
	}

	async deleteProject(projectId: string, ownerId: string): Promise<void> {
		const deleted = await this.repo.deleteProject(projectId, ownerId);
		if (!deleted) {
			throw new Error("Project not found or unauthorized");
		}
	}
}
