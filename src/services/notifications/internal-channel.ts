import "server-only";

import { alertEvents, getDatabase } from "@/db";
import type { NotificationChannel, NotificationMessage } from "./types";

export class InternalNotificationChannel implements NotificationChannel {
  readonly name = "internal";
  async deliver(message: NotificationMessage) {
    const [created] = await getDatabase().insert(alertEvents).values(message).onConflictDoNothing({ target: [alertEvents.alertId, alertEvents.deduplicationKey] }).returning({ id: alertEvents.id });
    return { delivered: Boolean(created), eventId: created?.id ?? null };
  }
}
