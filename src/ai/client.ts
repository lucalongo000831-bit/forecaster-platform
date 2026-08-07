import "server-only";

import OpenAI from "openai";
import { getKairoConfig } from "./config";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const config = getKairoConfig();
    client = new OpenAI({ apiKey: config.apiKey, maxRetries: 1, timeout: config.requestTimeoutMs });
  }
  return client;
}
