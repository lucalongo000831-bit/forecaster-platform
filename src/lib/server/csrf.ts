import "server-only";

import { getServerEnvironment, getPublicEnvironment } from "@/schemas/env";
import { AppError } from "./app-error";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new AppError("FORBIDDEN", "Origine richiesta non valida", 403);
  const env = getServerEnvironment();
  const configured = getPublicEnvironment().NEXT_PUBLIC_APP_URL ?? env.NEXTAUTH_URL;
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  if (new URL(origin).origin !== expected) throw new AppError("FORBIDDEN", "Origine richiesta non valida", 403);
}
