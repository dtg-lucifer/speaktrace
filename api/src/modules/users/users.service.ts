import { SystemSettingsService } from "~/modules/system/system_settings.service";
import type { IUsersRepository, UserRow } from "~/shared/database/repositories/users.repository";
import { createDebugProxy } from "~/shared/logging";
import { UserNotFoundError } from "./users.errors";
import type { UserResponse } from "./users.types";

function toResponse(user: UserRow): UserResponse {
	return {
		id: user.id,
		email: user.email,
		role: user.role ?? "member",
		plan: user.plan ?? "free",
		credits: user.credits !== undefined ? Number(user.credits) : 0,
		isActive: user.is_active,
		createdAt: user.created_at,
		updatedAt: user.updated_at,
	};
}

export interface IUsersService {
	getUserByEmail(email: string): Promise<UserResponse>;
	getCurrentUser(userId: string): Promise<UserResponse>;
	getUserCredits(
		userId: string,
		opts?: { limit?: number; offset?: number },
	): Promise<{ credits: number; plan: string; transactions: unknown[]; total: number }>;
}

export class UsersService implements IUsersService {
	private readonly settingsService = new SystemSettingsService();

	constructor(private readonly usersRepository: IUsersRepository) {}

	async getUserByEmail(email: string): Promise<UserResponse> {
		const user = await this.usersRepository.findByEmail(email);
		if (!user) {
			throw new UserNotFoundError();
		}

		return toResponse(user);
	}

	async getCurrentUser(userId: string): Promise<UserResponse> {
		const user = await this.usersRepository.findById(userId);
		if (!user) {
			throw new UserNotFoundError();
		}

		return toResponse(user);
	}

	async getUserCredits(userId: string, opts?: { limit?: number; offset?: number }) {
		const user = await this.getCurrentUser(userId);
		const txResult = await this.settingsService.getUserTransactions(userId, opts);
		return {
			credits: user.credits ?? 0,
			plan: user.plan ?? "free",
			transactions: txResult.transactions,
			total: txResult.total,
		};
	}

	static withDebug(usersRepository: IUsersRepository): IUsersService {
		return createDebugProxy(new UsersService(usersRepository), "UsersService");
	}
}
