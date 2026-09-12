import { pool } from "~/shared/database";

export interface ProjectRow {
	id: string;
	tenant_id: string;
	owner_id: string;
	name: string;
	description: string | null;
	is_active: boolean;
	created_at: Date;
	updated_at: Date;
	media_count?: number;
}

export interface IProjectsRepository {
	createProject(data: { ownerId: string; tenantId?: string; name: string; description?: string }): Promise<ProjectRow>;
	findProjectById(id: string, ownerId: string): Promise<ProjectRow | null>;
	listProjectsByOwner(ownerId: string): Promise<ProjectRow[]>;
	deleteProject(id: string, ownerId: string): Promise<boolean>;
	getProjectFilesAndJobs(projectId: string, ownerId: string): Promise<{
		project: ProjectRow;
		assets: unknown[];
		jobs: unknown[];
		transcripts: unknown[];
	} | null>;
}

export class ProjectsRepository implements IProjectsRepository {
	async createProject(data: { ownerId: string; tenantId?: string; name: string; description?: string }): Promise<ProjectRow> {
		const tenantId = data.tenantId ?? null;
		const query = `
			INSERT INTO projects (tenant_id, owner_id, name, description, is_active, created_at, updated_at)
			VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
			RETURNING *
		`;
		const res = await pool.query(query, [tenantId, data.ownerId, data.name, data.description ?? null]);
		return res.rows[0];
	}

	async findProjectById(id: string, ownerId: string): Promise<ProjectRow | null> {
		const query = `
			SELECT p.*, COUNT(m.id)::int as media_count
			FROM projects p
			LEFT JOIN media_assets m ON m.project_id = p.id
			WHERE p.id = $1 AND p.owner_id = $2
			GROUP BY p.id
		`;
		const res = await pool.query(query, [id, ownerId]);
		return res.rows[0] ?? null;
	}

	async listProjectsByOwner(ownerId: string): Promise<ProjectRow[]> {
		const query = `
			SELECT p.*, COUNT(m.id)::int as media_count
			FROM projects p
			LEFT JOIN media_assets m ON m.project_id = p.id
			WHERE p.owner_id = $1 AND p.is_active = TRUE
			GROUP BY p.id
			ORDER BY p.created_at DESC
		`;
		const res = await pool.query(query, [ownerId]);
		return res.rows;
	}

	async deleteProject(id: string, ownerId: string): Promise<boolean> {
		const query = `
			DELETE FROM projects
			WHERE id = $1 AND owner_id = $2
			RETURNING id
		`;
		const res = await pool.query(query, [id, ownerId]);
		return (res.rowCount ?? 0) > 0;
	}

	async getProjectFilesAndJobs(projectId: string, ownerId: string) {
		const project = await this.findProjectById(projectId, ownerId);
		if (!project) return null;

		const assetsRes = await pool.query(
			`SELECT * FROM media_assets WHERE project_id = $1 ORDER BY created_at DESC`,
			[projectId],
		);

		const jobsRes = await pool.query(
			`SELECT j.*, m.original_filename, m.duration_seconds, m.storage_url
			 FROM processing_jobs j
			 JOIN media_assets m ON m.id = j.media_asset_id
			 WHERE j.project_id = $1
			 ORDER BY j.created_at DESC`,
			[projectId],
		);

		const transcriptsRes = await pool.query(
			`SELECT t.*, j.id as job_id
			 FROM transcripts t
			 JOIN processing_jobs j ON j.id = t.job_id
			 WHERE t.project_id = $1
			 ORDER BY t.created_at DESC`,
			[projectId],
		);

		// Also attach speaker snippets for any jobs in AWAITING_SPEAKER_MAPPING or COMPLETED
		const speakersRes = await pool.query(
			`SELECT s.* FROM job_speakers s
			 JOIN processing_jobs j ON j.id = s.job_id
			 WHERE j.project_id = $1`,
			[projectId],
		);

		const jobsWithSpeakers = jobsRes.rows.map((job: Record<string, unknown>) => ({
			...job,
			speakers: speakersRes.rows.filter((s: Record<string, unknown>) => s.job_id === (job as { id: string }).id),
		}));

		return {
			project,
			assets: assetsRes.rows,
			jobs: jobsWithSpeakers,
			transcripts: transcriptsRes.rows,
		};
	}
}
