const base = new URL(process.env.KAIRO_DIAGNOSTIC_BASE_URL ?? "http://127.0.0.1:3000");
const routes = ["/api/health", "/calendar", "/political-intelligence", "/global-markets", "/instrument/nasdaqgs/aapl/overview", "/instrument/nasdaqgs/nvda/political"];

async function check(path) {
  try { const response = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15_000) }); return { path, status: response.status, ok: response.status >= 200 && response.status < 400 }; }
  catch (error) { return { path, status: error instanceof Error ? error.name : "ERROR", ok: false }; }
}

const results = await Promise.all(routes.map(check));
for (const result of results) process.stdout.write(`${result.path}: ${result.ok ? "OK" : "ERROR"} (${result.status})\n`);
if (results.some((result) => !result.ok)) process.exitCode = 1;
