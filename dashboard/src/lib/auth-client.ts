import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:8989",
});

export const { signIn, signUp, useSession, signOut } = authClient;
