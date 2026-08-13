export type CalendarEventType = "EARNINGS" | "DIVIDEND" | "MACRO" | "CENTRAL_BANK";
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
  status: import("./data-architecture-v2").DataStatus;
  provider: string | null;
  reason: string | null;
  count: number | null;
  lastUpdated: string | null;
  isLastKnownGood: boolean;
}

export interface MarketCalendarAnalysis {
  from: string;
  to: string;
  monthLabel: string;
  events: MarketCalendarEvent[];
  availability: Record<CalendarEventType, CalendarAvailability>;
  coverage: {
    implementedCategories: CalendarEventType[];
    availableCategories: CalendarEventType[];
    categoryCoverage: Record<CalendarEventType, number>;
    overallCoverage: number;
  };
  persisted: boolean;
  calculatedAt: string;
}
