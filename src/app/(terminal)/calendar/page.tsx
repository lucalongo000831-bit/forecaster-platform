import { CalendarView } from "@/components/financial/calendar-view";
import { financialDataService } from "@/services";

export default async function CalendarPage() {
  const data = await financialDataService.getCalendarData();
  return <CalendarView data={data}/>;
}
