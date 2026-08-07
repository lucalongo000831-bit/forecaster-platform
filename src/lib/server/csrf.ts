import "server-only";

import { getServerEnvironment, getPublicEnvironment } from "@/schemas/env";
import { AppError } from "./app-error";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new AppError("FORBIDDEN", "Origine richiesta non valida", 403);
  try {
    const env = getServerEnvironment(); const configured = getPublicEnvironment().NEXT_PUBLIC_APP_URL ?? env.NEXTAUTH_URL;
    const allowed = new Set([new URL(request.url).origin, ...(configured ? [new URL(configured).origin] : [])]);
    if (!allowed.has(new URL(origin).origin)) throw new AppError("FORBIDDEN", "Origine richiesta non valida", 403);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("FORBIDDEN", "Origine richiesta non valida", 403);
  }
}
