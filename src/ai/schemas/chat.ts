import { z } from "zod";
import { KAIRO_LIMITS } from "../config";

const optionalContext = z.string().trim().max(100).optional();

export const kairoChatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(KAIRO_LIMITS.maxMessageCharacters),
  symbol: z.string().trim().max(64).regex(/^[A-Za-z0-9.^=\-]+$/).optional(),
  market: optionalContext,
  assetType: z.enum(["equity", "etf", "fund", "index", "crypto", "forex", "commodity", "unknown"]).optional(),
  currentPage: optionalContext,
});

export type KairoChatRequest = z.infer<typeof kairoChatRequestSchema>;
