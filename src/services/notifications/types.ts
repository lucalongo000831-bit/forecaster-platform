export interface NotificationMessage { alertId: string; deduplicationKey: string; payload: Record<string, unknown>; }
export interface NotificationChannel { readonly name: string; deliver(message: NotificationMessage): Promise<{ delivered: boolean; eventId: string | null }>; }
