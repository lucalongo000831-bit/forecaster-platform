import { eq } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured, users } from "@/db";
import { createSession, hashPassword } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/csrf";
import { AppError } from "@/lib/server/app-error";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { parseJsonBody } from "@/lib/server/account-route";
import { getServerEnvironment, registerSchema } from "@/schemas";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); await enforceRateLimit(context.ip, { scope: "auth:register", limit: 5, windowSeconds: 300 }); if (!isDatabaseConfigured() || !getServerEnvironment().AUTH_SECRET) throw new AppError("NOT_CONFIGURED", "Registrazione non configurata", 503); const input = registerSchema.parse(await parseJsonBody(request)); const database = getDatabase(); if ((await database.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1))[0]) throw new AppError("CONFLICT", "Account già esistente", 409); const [user] = await database.insert(users).values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) }).returning({ id: users.id, email: users.email, name: users.name, role: users.role }); await createSession(user.id, request.headers.get("user-agent")); return jsonSuccess(user, context, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
