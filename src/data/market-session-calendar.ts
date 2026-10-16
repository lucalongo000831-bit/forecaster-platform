/** Official NYSE cash-equity early closes, Eastern time. Not a price dataset.
 * Source: https://www.nyse.com/markets/hours-calendars
 * https://ir.theice.com/press/news-details/2025/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/
 * Exceptional unscheduled closures are not inferred. */
export const US_EQUITY_EARLY_CLOSES: Readonly<Record<string, number>> = {
  "2025-07-03": 780, "2025-11-28": 780, "2025-12-24": 780,
  "2026-11-27": 780, "2026-12-24": 780,
  "2027-11-26": 780,
  "2028-07-03": 780, "2028-11-24": 780,
};
