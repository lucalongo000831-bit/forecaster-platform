import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { getDatabase } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { getServerEnvironment } from "@/schemas/env";
import { AppError } from "./app-error";
import { withServerTimeout } from "./promise-timeout";

const SESSION_COOKIE = "kairo_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const SESSION_LOOKUP_TIMEOUT_MS = 5_000;

function authSecret(): string {
  const secret = getServerEnvironment().AUTH_SECRET;
  if (!secret) throw new AppError("NOT_CONFIGURED", "Autenticazione non configurata", 503);
  return secret;
}

function tokenHash(token: string): string {
  return createHmac("sha256", authSecret()).update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 200) throw new AppError("BAD_REQUEST", "Password non valida", 400);
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1_000);
  await getDatabase().insert(sessions).values({ userId, tokenHash: tokenHash(token), expiresAt, userAgent: userAgent?.slice(0, 300) });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getDatabase().delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !getServerEnvironment().AUTH_SECRET) return null;
  const rows = await withServerTimeout(
    getDatabase()
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())))
      .limit(1),
    SESSION_LOOKUP_TIMEOUT_MS,
    "Verifica della sessione scaduta",
  );
  return rows[0] ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Autenticazione richiesta", 401);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN", "Administrator access required", 403);
  return user;
}
