import postgres from "postgres";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Database configuration is unavailable.");
  process.exitCode = 2;
} else {
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5, prepare: false });
  try {
    const expected = ["global_risk_snapshots", "global_risk_component_snapshots", "global_risk_triggers", "global_market_briefs", "global_market_brief_versions"];
    const rows = await sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = any(${expected}) order by table_name`;
    const found = rows.map((row) => row.table_name);
    console.log(JSON.stringify({ expected: expected.length, found: found.length, tables: found }, null, 2));
    if (found.length !== expected.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Schema check failed: ${error instanceof Error ? error.code ?? error.name : "UNKNOWN"}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
