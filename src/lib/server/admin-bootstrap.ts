import "server-only";

import { count, eq, sql } from "drizzle-orm";
import { getDatabase, users } from "@/db";
import { getServerEnvironment } from "@/schemas/env";
import type { AccountUser } from "@/types";
import { AppError } from "./app-error";

export async function bootstrapConfiguredAdministrator(user: AccountUser) {
  const configuredEmail = getServerEnvironment().KAIRO_BOOTSTRAP_ADMIN_EMAIL;
  if (!configuredEmail) throw new AppError("NOT_CONFIGURED", "Bootstrap amministratore non configurato", 503);
  if (user.email.trim().toLowerCase() !== configuredEmail) throw new AppError("FORBIDDEN", "Questo account non è autorizzato al bootstrap amministratore", 403);

  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('kairo-admin-bootstrap-v1'))`);
    const [current] = await transaction.select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!current || current.email.trim().toLowerCase() !== configuredEmail) throw new AppError("FORBIDDEN", "Account Kairo non valido", 403);
    if (current.role === "ADMIN") return { user: current, status: "ALREADY_ADMIN" as const };

    const [aggregate] = await transaction.select({ total: count() }).from(users).where(eq(users.role, "ADMIN"));
    if (Number(aggregate?.total ?? 0) > 0) throw new AppError("CONFLICT", "Un amministratore è già configurato", 409);

    const [promoted] = await transaction.update(users).set({ role: "ADMIN", updatedAt: new Date() }).where(eq(users.id, current.id)).returning({ id: users.id, email: users.email, name: users.name, role: users.role });
    if (!promoted) throw new AppError("INTERNAL_ERROR", "Promozione amministratore non riuscita", 500);
    return { user: promoted, status: "PROMOTED" as const };
  });
}
