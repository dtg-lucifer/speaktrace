import type { ISystemSettingsRepository } from "./system_settings.repository";
import { SystemSettingsRepository } from "./system_settings.repository";

export interface JobCostCalculationInput {
	durationSeconds?: number | null;
	options?: {
		emotion_tagging?: boolean;
		punctuation?: boolean;
		diarization?: boolean;
		rag_indexing?: boolean;
		custom_export?: boolean;
		[key: string]: unknown;
	};
}

export interface CreditCostBreakdown {
	totalCredits: number;
	transcriptionCredits: number;
	diarizationCredits: number;
	enrichmentCredits: number;
	ragCredits: number;
	exportCredits: number;
}

export interface ISystemSettingsService {
	getSettings(): Promise<Record<string, unknown>>;
	getSettingByKey<T = unknown>(key: string, defaultValue?: T): Promise<T>;
	updateSetting(key: string, value: unknown, description?: string): Promise<void>;
	calculateJobCost(input: JobCostCalculationInput): Promise<CreditCostBreakdown>;
	deductJobCredits(userId: string, amount: number, jobId: string): Promise<number>;
	grantUserCredits(userId: string, amount: number, type: string, description: string): Promise<number>;
	getUserTransactions(userId: string, opts?: { limit?: number; offset?: number }): Promise<{ transactions: unknown[]; total: number }>;
}

export class SystemSettingsService implements ISystemSettingsService {
	constructor(private readonly repo: ISystemSettingsRepository = new SystemSettingsRepository()) {}

	async getSettings(): Promise<Record<string, unknown>> {
		const settings = await this.repo.getAllSettings();

		// Default fallbacks if empty
		return {
			default_free_credits: settings.default_free_credits ?? 50,
			credit_cost_per_minute_transcription: settings.credit_cost_per_minute_transcription ?? 10,
			credit_cost_per_minute_diarization: settings.credit_cost_per_minute_diarization ?? 0,
			credit_cost_per_minute_enrichment: settings.credit_cost_per_minute_enrichment ?? 0,
			credit_cost_rag_indexing: settings.credit_cost_rag_indexing ?? 0,
			credit_cost_export: settings.credit_cost_export ?? 0,
			...settings,
		};
	}

	async getSettingByKey<T = unknown>(key: string, defaultValue?: T): Promise<T> {
		const val = await this.repo.getSettingByKey<T>(key);
		if (val === null || val === undefined) {
			return defaultValue as T;
		}
		return val;
	}

	async updateSetting(key: string, value: unknown, description?: string): Promise<void> {
		await this.repo.upsertSetting(key, value, description);
	}

	async calculateJobCost(input: JobCostCalculationInput): Promise<CreditCostBreakdown> {
		const settings = await this.getSettings();

		const costPerMinStt = Number(settings.credit_cost_per_minute_transcription ?? 2);
		const costPerMinDiarization = Number(settings.credit_cost_per_minute_diarization ?? 3);
		const costPerMinEnrichment = Number(settings.credit_cost_per_minute_enrichment ?? 2);
		const costRag = Number(settings.credit_cost_rag_indexing ?? 5);
		const costExport = Number(settings.credit_cost_export ?? 1);

		// If duration is missing or less than 60s, count as 1 minute minimum
		const durationSec = Math.max(input.durationSeconds ?? 60, 60);
		const durationMinutes = Math.ceil(durationSec / 60);

		const transcriptionCredits = durationMinutes * costPerMinStt;
		const diarizationCredits = input.options?.diarization !== false ? durationMinutes * costPerMinDiarization : 0;
		const enrichmentCredits = input.options?.emotion_tagging ? durationMinutes * costPerMinEnrichment : 0;
		const ragCredits = input.options?.rag_indexing !== false ? costRag : 0;
		const exportCredits = input.options?.custom_export ? costExport : 0;

		const totalCredits = transcriptionCredits + diarizationCredits + enrichmentCredits + ragCredits + exportCredits;

		return {
			totalCredits,
			transcriptionCredits,
			diarizationCredits,
			enrichmentCredits,
			ragCredits,
			exportCredits,
		};
	}

	async deductJobCredits(userId: string, amount: number, jobId: string): Promise<number> {
		const result = await this.repo.deductCredits(
			userId,
			amount,
			"job_processing",
			`Audio processing job deduction for ${jobId}`,
			jobId,
		);
		return result.creditsRemaining;
	}

	async grantUserCredits(userId: string, amount: number, type: string, description: string): Promise<number> {
		const result = await this.repo.grantCredits(userId, amount, type, description);
		return result.creditsRemaining;
	}

	async getUserTransactions(userId: string, opts?: { limit?: number; offset?: number }) {
		return this.repo.getCreditTransactions(userId, opts);
	}
}
