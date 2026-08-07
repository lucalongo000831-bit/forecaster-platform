import "server-only";

import type { CompanyIntelligenceReport } from "@/types";

function text(value: unknown) { return value === null || value === undefined ? "DATA NOT AVAILABLE" : typeof value === "number" ? Number(value.toPrecision(6)).toString() : String(value); }
function csvCell(value: unknown) { const normalized = text(value); return /[",\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized; }

export function companyMetricsCsv(report: CompanyIntelligenceReport) {
  const rows: Array<[string, unknown, string]> = [
    ["symbol", report.symbol, "FACT"], ["name", report.name, "FACT"], ["price", report.currentPrice, "FACT"], ["currency", report.currency, "FACT"], ["overall_score", report.overallScore, "MODEL_OUTPUT"], ["verdict", report.verdict, "MODEL_OUTPUT"], ["confidence", report.confidence, "MODEL_OUTPUT"], ["quality_score", report.quality?.totalScore, "MODEL_OUTPUT"], ["earnings_quality_score", report.earningsQuality?.score, "MODEL_OUTPUT"], ["moat_score", report.moat?.score, "MODEL_OUTPUT"], ["management_score", report.management?.overallScore, "MODEL_OUTPUT"], ["risk_score", report.risks?.overallRiskScore, "MODEL_OUTPUT"], ["fair_value", report.valuation?.fairValue, "MODEL_OUTPUT"], ["prudent_fair_value", report.valuation?.prudentFairValue, "MODEL_OUTPUT"], ["margin_of_safety", report.valuation?.marginOfSafety, "CALCULATED"], ["model_version", report.modelVersion, "MODEL_OUTPUT"], ["data_timestamp", report.dataTimestamp, "FACT"], ["calculated_at", report.calculatedAt, "MODEL_OUTPUT"],
  ];
  return ["metric,value,classification", ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function pdfEscape(value: string) { return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7E]/g, "?"); }
export function companyReportPdf(report: CompanyIntelligenceReport) {
  const lines = [
    `KAIRO COMPANY INTELLIGENCE - ${report.name} (${report.symbol})`, `Analysis date: ${report.calculatedAt}`, `Reference price: ${text(report.currentPrice)} ${report.currency}`, `Verdict: ${report.verdict.replaceAll("_", " ")} | Score: ${text(report.overallScore)} | Confidence: ${report.confidence}`,
    `Fair value: ${text(report.valuation?.fairValue)} | Margin of safety: ${text(report.valuation?.marginOfSafety)}`, "", "WHY IT MAY WORK", ...report.thesis.whyItMayWork.slice(0, 6).map((item) => `- ${item}`), "", "WHY IT MAY FAIL", ...report.thesis.whyItMayFail.slice(0, 8).map((item) => `- ${item}`), "", "SCENARIOS", ...(report.valuation?.scenarios ?? []).map((item) => `${item.name}: ${text(item.fairValuePerShare)} ${report.currency} (${text(item.upsideDownside)})`), "", "SOURCES", ...report.sources.slice(0, 12).map((source) => `- ${source.provider}: ${source.label} ${source.timestamp ?? ""}`), "", "LIMITATIONS", ...report.limitations.slice(0, 10).map((item) => `- ${item}`), "", `Model: ${report.modelVersion} / ${report.scoringVersion} / ${report.valuationVersion}`, "Non-personalized research. Not investment advice.",
  ].map((line) => line.slice(0, 115));
  const pageLines = lines.slice(0, 48); let stream = "BT\n/F1 10 Tf\n48 790 Td\n";
  for (const [index, line] of pageLines.entries()) stream += `${index ? "0 -15 Td\n" : ""}(${pdfEscape(line)}) Tj\n`;
  stream += "ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let body = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length; body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}
