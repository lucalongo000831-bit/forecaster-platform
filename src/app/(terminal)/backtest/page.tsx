import { BacktestLab } from "@/components/financial/backtest-lab";
import { Footer } from "@/components/shell/footer";

export default function BacktestPage() {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear() - 5, today.getUTCMonth(), today.getUTCDate()));
  return <><BacktestLab defaultFrom={from.toISOString().slice(0, 10)} defaultTo={today.toISOString().slice(0, 10)}/><Footer/></>;
}
