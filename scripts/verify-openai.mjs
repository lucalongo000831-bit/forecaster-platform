import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_AUTH: MANCANTE");
  process.exit(1);
}
if (!process.env.OPENAI_MODEL) {
  console.error("OPENAI_MODEL: MANCANTE");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20_000, maxRetries: 0 });
try {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL,
    input: "Rispondi soltanto con OK.",
    max_output_tokens: 16,
    store: false,
  });
  if (!response.id) throw new Error("Risposta priva di identificatore");
  console.log("OPENAI_AUTH: OK");
  console.log("OPENAI_RESPONSES: OK");
} catch (error) {
  const status = typeof error === "object" && error && "status" in error ? String(error.status) : "UNKNOWN";
  console.error(status === "401" || status === "403" ? `OPENAI_AUTH: ERRORE_${status}` : "OPENAI_AUTH: OK");
  console.error(`OPENAI_RESPONSES: ERRORE_${status}`);
  process.exit(1);
}
