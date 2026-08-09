import { z } from "zod";
import { symbolSchema } from "./market";

export const politicalPeriodSchema = z.enum(["7D", "30D", "90D", "6M", "1Y", "3Y", "5Y", "MAX"]);
export const politicalFiltersSchema = z.object({
  period: politicalPeriodSchema.default("90D"), chamber: z.enum(["ALL", "HOUSE", "SENATE", "UNKNOWN"]).default("ALL"),
  party: z.enum(["ALL", "DEMOCRATIC", "REPUBLICAN", "INDEPENDENT", "OTHER", "UNKNOWN"]).default("ALL"),
  transactionType: z.enum(["ALL", "PURCHASE", "SALE_FULL", "SALE_PARTIAL", "SALE", "EXCHANGE", "OPTION", "OTHER", "UNKNOWN"]).default("ALL"),
  ownerType: z.enum(["ALL", "SELF", "SPOUSE", "DEPENDENT", "JOINT", "TRUST", "OTHER", "UNKNOWN"]).default("ALL"),
  symbol: symbolSchema.optional(), sector: z.string().trim().max(160).optional(), politician: z.string().trim().max(220).optional(), query: z.string().trim().max(220).optional(),
  clusterOnly: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  sort: z.enum(["DISCLOSURE_DATE", "TRANSACTION_DATE", "AMOUNT", "DELAY", "PERFORMANCE", "POLITICIAN"]).default("DISCLOSURE_DATE"),
  page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(20), format: z.enum(["json", "csv"]).default("json"),
});
