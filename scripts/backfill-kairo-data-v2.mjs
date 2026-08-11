const allowed = new Set(["economic", "calendar", "political", "cftc", "news", "global-risk"]);
const job = process.argv[2]; const base = new URL(process.env.KAIRO_BACKFILL_BASE_URL ?? "http://127.0.0.1:3000"); const secret = process.env.CRON_SECRET;
if (!allowed.has(job)) { process.stderr.write("Usage: npm run data-v2:backfill -- <economic|calendar|political|cftc|news|global-risk>\n"); process.exit(2); }
if (!secret) { process.stderr.write("CRON_SECRET is required; its value will never be printed.\n"); process.exit(2); }
const url = new URL("/api/cron/data-v2", base); url.searchParams.set("job", job);
const response = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(300_000) });
process.stdout.write(`BACKFILL ${job}: ${response.ok ? "OK" : "ERROR"} (${response.status})\n`);
if (!response.ok) process.exitCode = 1;
