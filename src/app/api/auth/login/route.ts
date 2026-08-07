import { eq } from "drizzle-orm";
import { getDatabase, isDatabaseConfigured, users } from "@/db";
import { createSession, verifyPassword } from "@/lib/server/auth";
import { assertSameOrigin } from "@/lib/server/csrf";
import { AppError } from "@/lib/server/app-error";
import { createRequestContext } from "@/lib/server/request-context";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { jsonFailure, jsonSuccess } from "@/lib/server/api-response";
import { parseJsonBody } from "@/lib/server/account-route";
import { getServerEnvironment, loginSchema } from "@/schemas";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { const context = createRequestContext(request); try { assertSameOrigin(request); await enforceRateLimit(context.ip, { scope: "auth:login", limit: 8, windowSeconds: 300 }); if (!isDatabaseConfigured() || !getServerEnvironment().AUTH_SECRET) throw new AppError("NOT_CONFIGURED", "Login non configurato", 503); const input = loginSchema.parse(await parseJsonBody(request)); const [record] = await getDatabase().select().from(users).where(eq(users.email, input.email)).limit(1); if (!record?.passwordHash || !(await verifyPassword(input.password, record.passwordHash))) throw new AppError("UNAUTHENTICATED", "Credenziali non valide", 401); await createSession(record.id, request.headers.get("user-agent")); return jsonSuccess({ id: record.id, email: record.email, name: record.name, role: record.role }, context, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return jsonFailure(error, context); } }
