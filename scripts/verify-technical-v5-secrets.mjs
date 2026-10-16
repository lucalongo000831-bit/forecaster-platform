import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const changed = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter((path) => path && !/ 2\.[^/]+$/.test(path));
const sensitiveFiles = [...new Set([...tracked, ...changed])].filter((path) => /(^|\/)\.env(?:\.[^/]+)?$/.test(path) && !/\.(example|sample|template)$/.test(path));
const values = [];
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/);
    if (!match || !/(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL)$/.test(match[1])) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value.length >= 12 && !value.includes("${")) values.push(value);
  }
}
const credential = /(?:sk-proj-[A-Za-z0-9_-]{45,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const check = (path) => { if (!existsSync(path)) return false; const content = readFileSync(path, "utf8"); return credential.test(content) || values.some((value) => content.includes(value)); };
const sourceHits = [...new Set([...tracked, ...changed])].filter(check);
function bundleFiles(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? bundleFiles(join(path, entry.name)) : entry.isFile() && /\.(js|json|map)$/.test(entry.name) ? [join(path, entry.name)] : []);
}
const bundles = bundleFiles(process.argv[2] ?? ".next/static");
const bundleHits = bundles.filter(check);
console.log(JSON.stringify({ trackedFiles: tracked.length, additionalFiles: changed.length, sensitiveTrackedOrPendingFiles: sensitiveFiles.length, sourceSecretValueHits: sourceHits.length, clientBundleFiles: bundles.length, clientBundleSecretValueHits: bundleHits.length, failures: [...sensitiveFiles, ...sourceHits, ...bundleHits] }));
if (sensitiveFiles.length || sourceHits.length || bundleHits.length) process.exitCode = 1;
