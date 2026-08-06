import "server-only";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { getServerEnvironment } from "@/schemas/env";
import { AppError } from "@/lib/server/app-error";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let sqlClient: Sql | undefined;
let database: Database | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(getServerEnvironment().DATABASE_URL);
}

export function getDatabase(): Database {
  const url = getServerEnvironment().DATABASE_URL;
  if (!url) throw new AppError("NOT_CONFIGURED", "Database non configurato", 503, false);
  if (!sqlClient) {
    sqlClient = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined,
    });
    database = drizzle(sqlClient, { schema });
  }
  return database!;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await getDatabase().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
