import { WatchlistView } from "@/components/financial/watchlist-view";
import { financialDataService } from "@/services";

export default async function WatchlistsPage() {
  const rows = await financialDataService.getWatchlist();
  return <WatchlistView initialRows={rows}/>;
}
