import type { LineStyle, Time } from "lightweight-charts";

export type KairoChartValueFormat = "number" | "price" | "percent" | "volume";
export type KairoChartSeriesType = "line" | "area" | "baseline" | "histogram";

export type KairoChartPoint = {
  time: Time;
  value: number;
  label: string;
  metadata?: string;
  color?: string;
};

export type KairoChartMarker = {
  time: Time;
  position: "aboveBar" | "belowBar" | "inBar";
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  color: string;
  text?: string;
};

export type KairoChartSeriesDefinition = {
  id: string;
  label: string;
  type: KairoChartSeriesType;
  data: KairoChartPoint[];
  color: string;
  topColor?: string;
  bottomColor?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: LineStyle;
  visible?: boolean;
  lastValueVisible?: boolean;
  priceLineVisible?: boolean;
  format?: KairoChartValueFormat;
  markers?: KairoChartMarker[];
  showInLegend?: boolean;
};

export type KairoHorizontalLine = {
  value: number;
  color: string;
  title?: string;
  lineWidth?: 1 | 2 | 3 | 4;
  lineStyle?: LineStyle;
};
