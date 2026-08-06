export type LedgerTransactionType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "FEE" | "SPLIT";

export interface LedgerTransaction {
  instrumentId: string | null;
  type: LedgerTransactionType;
  executedAt: Date | string;
  quantity: number | null;
  price: number | null;
  fees: number;
}

export interface LedgerPosition {
  instrumentId: string;
  quantity: number;
  averagePrice: number;
  realizedPnl: number;
}

const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : value;

export function calculateLedger(transactions: LedgerTransaction[]): LedgerPosition[] {
  const positions = new Map<string, LedgerPosition>();
  const ordered = [...transactions].sort((a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime());

  for (const transaction of ordered) {
    if (!transaction.instrumentId) continue;
    const current = positions.get(transaction.instrumentId) ?? { instrumentId: transaction.instrumentId, quantity: 0, averagePrice: 0, realizedPnl: 0 };
    const quantity = transaction.quantity ?? 0;
    const price = transaction.price ?? 0;
    const fees = transaction.fees ?? 0;

    if (transaction.type === "BUY") {
      if (current.quantity < 0) {
        const covered = Math.min(quantity, Math.abs(current.quantity));
        current.realizedPnl += (current.averagePrice - price) * covered - fees;
        const residual = quantity - covered;
        current.quantity += quantity;
        current.averagePrice = residual > 0 ? price : current.quantity === 0 ? 0 : current.averagePrice;
      } else {
        const newQuantity = current.quantity + quantity;
        current.averagePrice = newQuantity === 0 ? 0 : ((current.quantity * current.averagePrice) + (quantity * price) + fees) / newQuantity;
        current.quantity = newQuantity;
      }
    } else if (transaction.type === "SELL") {
      if (current.quantity > 0) {
        const closed = Math.min(quantity, current.quantity);
        current.realizedPnl += (price - current.averagePrice) * closed - fees;
        const residual = quantity - closed;
        current.quantity -= quantity;
        current.averagePrice = residual > 0 ? price : current.quantity === 0 ? 0 : current.averagePrice;
      } else {
        const newAbsolute = Math.abs(current.quantity) + quantity;
        current.averagePrice = newAbsolute === 0 ? 0 : ((Math.abs(current.quantity) * current.averagePrice) + (quantity * price)) / newAbsolute;
        current.quantity -= quantity;
        current.realizedPnl -= fees;
      }
    } else if (transaction.type === "DIVIDEND") {
      current.realizedPnl += quantity * price - fees;
    } else if (transaction.type === "FEE") {
      current.realizedPnl -= fees || price || quantity;
    } else if (transaction.type === "SPLIT" && quantity > 0) {
      current.quantity *= quantity;
      current.averagePrice /= quantity;
    }

    current.quantity = clean(current.quantity);
    current.averagePrice = clean(current.averagePrice);
    current.realizedPnl = clean(current.realizedPnl);
    positions.set(transaction.instrumentId, current);
  }

  return [...positions.values()].filter((position) => position.quantity !== 0 || position.realizedPnl !== 0);
}
