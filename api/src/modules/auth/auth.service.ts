import { compareHashedPassword, hashPassword } from "~/lib/password";
import { SystemSettingsService } from "~/modules/system/system_settings.service";
import type { IEventBus } from "~/shared/events";
import { eventBus } from "~/shared/events";
import { createDebugProxy } from "~/shared/logging";
import { generateRefreshToken, generateToken } from "~/shared/middlewares/jwt.middleware";
import { AuthUserNotFoundError, InactiveUserError, InvalidCredentialsError, UserAlreadyExistsError } from "./auth.errors";
import type { AuthUserRow, IAuthRepository } from "./auth.repository";
import type { AuthLoginResponse, AuthUser, LoginInput, RegisterInput } from "./auth.types";

function toAuthUser(user: AuthUserRow): AuthUser {
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

export interface IAuthService {
	register(input: RegisterInput): Promise<{ user: AuthUser }>;
	login(input: LoginInput): Promise<AuthLoginResponse>;
	getCurrentUser(userId: string): Promise<{ user: AuthUser }>;
}

export class AuthService implements IAuthService {
	private readonly settingsService = new SystemSettingsService();

	constructor(
		private readonly authRepository: IAuthRepository,
		private readonly events: IEventBus = eventBus,
	) {}

	async register(input: RegisterInput): Promise<{ user: AuthUser }> {
		const existing = await this.authRepository.findByEmail(input.email);
		if (existing) {
			throw new UserAlreadyExistsError(input.email);
		}

		// Fetch default initial free credits from system settings
		const defaultCredits = await this.settingsService.getSettingByKey<number>("default_free_credits", 100);

		const passwordHash = await hashPassword(input.password);
		const user = await this.authRepository.createWithAudit({
			email: input.email,
			passwordHash,
			role: "member",
			plan: "free",
			credits: defaultCredits,
		});

		// Record welcome bonus transaction ledger entry if credits > 0
		if (defaultCredits > 0) {
			try {
				await this.settingsService.grantUserCredits(
					user.id,
					0, // user already created with defaultCredits balance
					"welcome_bonus",
					"Welcome bonus free credits upon account registration",
				);
			} catch (_) {
				// Ignore non-fatal ledger recording issue if initial creation succeeded
			}
		}

		this.events.emit("auth.user.registered", {
			userId: user.id,
			email: user.email,
		});

		return { user: toAuthUser(user) };
	}

	async login(input: LoginInput): Promise<AuthLoginResponse> {
		const user = await this.authRepository.findByEmail(input.email);

		if (!user) {
			throw new InvalidCredentialsError();
		}

		if (!user.is_active) {
			throw new InactiveUserError();
		}

		const passwordOk = await compareHashedPassword(input.password, user.password_hash);
		if (!passwordOk) {
			throw new InvalidCredentialsError();
		}

		const payload = { id: user.id, email: user.email };

		return {
			user: toAuthUser(user),
			tokens: {
				accessToken: generateToken(payload),
				refreshToken: generateRefreshToken(payload),
			},
		};
	}

	async getCurrentUser(userId: string): Promise<{ user: AuthUser }> {
		const user = await this.authRepository.findById(userId);

		if (!user) {
			throw new AuthUserNotFoundError();
		}

		return { user: toAuthUser(user) };
	}

	static withDebug(authRepository: IAuthRepository, events: IEventBus = eventBus): IAuthService {
		return createDebugProxy(new AuthService(authRepository, events), "AuthService");
	}
}
