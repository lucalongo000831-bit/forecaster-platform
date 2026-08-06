import { SearchView } from "@/components/financial/search-view";
import { financialDataService } from "@/services";

export default async function SearchPage() {
  const instruments = await financialDataService.getSearchUniverse();
  return <SearchView instruments={instruments}/>;
}
