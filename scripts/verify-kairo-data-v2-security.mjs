import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

const repositoryRoot = process.cwd();
const secretEnvironmentNames = [
  "FRED_API_KEY",
  "BLS_API_KEY",
  "BEA_API_KEY",
  "EIA_API_KEY",
  "MARKETAUX_API_TOKEN",
  "OPENFIGI_API_KEY",
  "MASSIVE_API_KEY",
  "FMP_API_KEY",
  "ALPHA_VANTAGE_API_KEY",
  "EODHD_API_TOKEN",
  "FINNHUB_API_KEY",
  "COINGECKO_API_KEY",
  "OPENAI_API_KEY",
];

const credentials = secretEnvironmentNames
  .map((name) => process.env[name]?.trim())
  .filter((value) => Boolean(value));

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Impossibile elencare i file versionati.");
  return result.stdout.split("\0").filter(Boolean);
}

function lineForOffset(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function reportFinding(file, line) {
  process.stdout.write(`POTENTIAL SECRET FOUND\nFILE: ${file}\nLINE: ${line}\n`);
}

function scanTrackedCredentials(files) {
  let safe = true;
  for (const file of files) {
    let content;
    try {
      content = readFileSync(join(repositoryRoot, file), "utf8");
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;
    for (const credential of credentials) {
      const offset = content.indexOf(credential);
      if (offset === -1) continue;
      reportFinding(file, lineForOffset(content, offset));
      safe = false;
      break;
    }
  }
  return safe;
}

function scanClientSources(files) {
  let safe = true;
  const privateEnvironmentPattern = new RegExp(secretEnvironmentNames.join("|"));
  for (const file of files.filter((name) => /^src\/.*\.(?:ts|tsx|js|jsx)$/.test(name))) {
    const content = readFileSync(join(repositoryRoot, file), "utf8");
    if (!/^\s*["']use client["'];/m.test(content)) continue;
    const match = privateEnvironmentPattern.exec(content);
    if (!match) continue;
    reportFinding(file, lineForOffset(content, match.index));
    safe = false;
  }
  return safe;
}

function listFilesRecursively(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...listFilesRecursively(path));
    else files.push(path);
  }
  return files;
}

function scanClientBundle() {
  const staticRoot = join(repositoryRoot, ".next", "static");
  if (!existsSync(staticRoot)) return false;
  let safe = true;
  for (const path of listFilesRecursively(staticRoot)) {
    const content = readFileSync(path);
    for (const credential of credentials) {
      if (!content.includes(Buffer.from(credential))) continue;
      reportFinding(relative(repositoryRoot, path), 0);
      safe = false;
      break;
    }
  }
  return safe;
}

const files = trackedFiles();
const trackedSafe = scanTrackedCredentials(files);
const sourceSafe = scanClientSources(files);
const bundleSafe = scanClientBundle();

process.stdout.write(`SECRET_SCAN: ${trackedSafe ? "OK" : "ERROR"}\n`);
process.stdout.write(`CLIENT_SOURCE_SCAN: ${sourceSafe ? "OK" : "ERROR"}\n`);
process.stdout.write(`CLIENT_BUNDLE_SECRET_SCAN: ${bundleSafe ? "OK" : "ERROR"}\n`);

if (!trackedSafe || !sourceSafe || !bundleSafe) process.exitCode = 1;
