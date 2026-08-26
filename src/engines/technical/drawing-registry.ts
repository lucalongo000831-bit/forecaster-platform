import type { TechnicalDrawingType } from "@/types";

export interface TechnicalDrawingDefinition {
  id: TechnicalDrawingType;
  label: string;
  anchors: 1 | 2 | 3;
  description: string;
  supportsText: boolean;
}

export const TECHNICAL_DRAWING_REGISTRY: readonly TechnicalDrawingDefinition[] = [
  { id: "horizontal", label: "Horizontal line", anchors: 1, description: "Price level across the chart.", supportsText: false },
  { id: "trend", label: "Trend line", anchors: 2, description: "Line between two time-price anchors.", supportsText: false },
  { id: "horizontal-ray", label: "Horizontal ray", anchors: 1, description: "Price level extending right from its anchor.", supportsText: false },
  { id: "vertical", label: "Vertical line", anchors: 1, description: "Timestamp marker for an event or reference date.", supportsText: false },
  { id: "rectangle", label: "Rectangle / zone", anchors: 2, description: "Two-corner support, resistance or consolidation zone.", supportsText: false },
  { id: "fib-retracement", label: "Fibonacci retracement", anchors: 2, description: "Canonical retracement ratios between two anchors.", supportsText: false },
  { id: "fib-extension", label: "Fibonacci extension", anchors: 3, description: "Impulse A–B projected from C.", supportsText: false },
  { id: "text", label: "Text note", anchors: 1, description: "Sanitized local research annotation.", supportsText: true },
  { id: "anchored-vwap", label: "Anchored VWAP", anchors: 1, description: "Cumulative bar-based VWAP from a selected timestamp.", supportsText: false },
] as const;

export function drawingDefinition(type: TechnicalDrawingType) {
  return TECHNICAL_DRAWING_REGISTRY.find((definition) => definition.id === type) ?? null;
}
