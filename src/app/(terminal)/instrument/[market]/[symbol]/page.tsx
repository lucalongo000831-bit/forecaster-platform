import { redirect } from "next/navigation";
import { instrumentPath } from "@/lib";

export default async function InstrumentIndex({ params }: { params: Promise<{ market: string; symbol: string }> }) {
  redirect(instrumentPath(await params));
}
