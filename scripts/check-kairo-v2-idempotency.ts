import { getDatabase, isDatabaseConfigured, politicalTransactions } from "../src/db";
import { count } from "drizzle-orm";
import { syncPoliticalDisclosures } from "../src/services/political";

async function main() { if (!isDatabaseConfigured()) throw new Error("DATABASE_NOT_CONFIGURED"); const database = getDatabase(); const before = Number((await database.select({ value: count() }).from(politicalTransactions))[0]?.value ?? 0); const first = await syncPoliticalDisclosures({ limit: 500 }); const middle = Number((await database.select({ value: count() }).from(politicalTransactions))[0]?.value ?? 0); const second = await syncPoliticalDisclosures({ limit: 500 }); const after = Number((await database.select({ value: count() }).from(politicalTransactions))[0]?.value ?? 0); console.log(JSON.stringify({ before, middle, after, first, second, idempotent: middle === after }, null, 2)); if (middle !== after) process.exitCode = 1; }
void main();
