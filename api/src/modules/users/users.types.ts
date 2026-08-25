export interface UserResponse {
	id: string;
	email: string;
	role?: string;
	plan?: string;
	credits?: number;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}
