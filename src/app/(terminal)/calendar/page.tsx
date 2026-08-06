import { CalendarView } from "@/components/financial/calendar-view";
import { getMarketCalendar } from "@/services/calendar/calendar-service";

export default async function CalendarPage() {
  const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const data = await getMarketCalendar(from, to);
  return <CalendarView initial={data}/>;
}
