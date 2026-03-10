import { DailySummaryRowNormalized, ChartPoint } from "../types/types.home";

export function formatSleep(seconds: number | null) {
  if (!seconds || seconds < 1) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
 return `${hours}h ${minutes}m`;
}

export function formatDay(day: string | Date) {
  if (day instanceof Date) {
    return day.toISOString().slice(0, 10);
  }
  return day;
}

export function formatTimestamp(value: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function buildLineChartPoints(
  rows: DailySummaryRowNormalized[],
  getValue: (row: DailySummaryRowNormalized) => number | null,
  width: number,
  height: number
) {
  const chartRows = [...rows].reverse();
  const values = chartRows
    .map((row) => getValue(row))
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return { points: [] as ChartPoint[], polyline: "" };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 24;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const count = chartRows.length;

  const points = chartRows
    .map((row, index) => {
      const rawValue = getValue(row);
      if (rawValue === null) return null;

      const x =
        count <= 1
          ? width / 2
          : padding + (index / (count - 1)) * innerWidth;
      const normalized = (rawValue - min) / range;
      const y = padding + (1 - normalized) * innerHeight;

      return {
        x,
        y,
        label: formatDay(row.day),
        value: rawValue,
      };
    })
    .filter((point): point is ChartPoint => point !== null);

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  return { points, polyline };
}

export function getRecoveryLabel(score: number | null) {
  if (score === null) return "No score";
  if (score >= 85) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Low";
}

export function getRecoveryTone(score: number | null): "neutral" | "good" | "warn" {
  if (score === null) return "neutral";
  if (score >= 75) return "good";
  if (score >= 60) return "neutral";
  return "warn";
}

export function formatSteps(steps: number | null) {
  if (steps === null) return "-";
  return new Intl.NumberFormat("en-US").format(steps);
}

export function formatHrv(value: number | null) {
  if (value === null) return "-";
  return `${Math.round(value)} ms`;
}

export function formatBpm(value: number | null) {
  if (value === null) return "-";
  return `${Math.round(value)} bpm`;
}

export function getSleepTone(seconds: number | null): "good" | "neutral" | "warn" {
  if (seconds === null) return "neutral";
  if (seconds >= 7 * 3600) return "good";
  if (seconds >= 6 * 3600) return "neutral";
  return "warn";
}

export function getHrvSignal(
  hrv: number | null,
  baseline: number | null
): { label: "High" | "Normal" | "Low" | "No data"; tone: "good" | "neutral" | "warn"; message: string } {
  if (hrv === null || baseline === null) return { label: "No data", tone: "neutral", message: "Your recovery signal looks stable compared to baseline."};
  if (hrv >= baseline + 5) return { label: "High", tone: "good", message: "Your body looks well recovered and ready for higher strain."};
  if (hrv <= baseline - 5) return { label: "Low", tone: "warn", message: "Your nervous system looks stressed. Consider a lighter training day." };
  return { label: "Normal", tone: "neutral", message: "Your recovery signal looks stable compared to baseline." };
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
