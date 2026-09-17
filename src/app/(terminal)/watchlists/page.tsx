import { WatchlistView } from "@/components/financial/watchlist-view";
import { financialDataService } from "@/services";

export default async function WatchlistsPage() { const instruments = await financialDataService.getSearchUniverse().catch(() => []); return <WatchlistView instruments={instruments}/>; }
