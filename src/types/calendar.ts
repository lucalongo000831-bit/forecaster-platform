export type CalendarEventType = "EARNINGS" | "DIVIDEND" | "MACRO";
export interface MarketCalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  time: string | null;
  symbol: string | null;
  country: string | null;
  importance: "LOW" | "MEDIUM" | "HIGH";
  provider: string;
  estimate: number | null;
  actual: number | null;
  previous: number | null;
  unit: string | null;
  timezone: string;
  company: string | null;
  currency: string | null;
  sourceTimestamp: string | null;
  details: Record<string, string | number | null>;
}

export interface CalendarAvailability {
  status: "AVAILABLE" | "UNAVAILABLE";
  provider: string | null;
  reason: string | null;
}

export interface MarketCalendarAnalysis {
  from: string;
  to: string;
  monthLabel: string;
  events: MarketCalendarEvent[];
  availability: Record<CalendarEventType, CalendarAvailability>;
  persisted: boolean;
  calculatedAt: string;
}
