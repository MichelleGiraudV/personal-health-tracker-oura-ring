export type DailySummaryRow = {
  day: string;
  sleep_total_seconds: number | string | null;
  readiness_score: number | string | null;
  steps: number | string | null;
  activity_score: number | string | null;
  hrv_avg_ms: number | string | null;
  resting_hr_bpm: number | string | null;
  stress_high_minutes: number | string | null;
  recovery_high_minutes: number | string | null;
  stress_day_summary: string | null;

};

export type DailySummaryRowNormalized = {
  day: string;
  sleep_total_seconds: number | null;
  readiness_score: number | null;
  steps: number | null;
  activity_score: number | null;
  hrv_avg_ms: number | null;
  resting_hr_bpm: number | null;
  stress_high_minutes: number | null;
  recovery_high_minutes: number | null;
  stress_day_summary: string | null;

};

export type LastSyncedRow = {
  last_synced_at: string | Date | null;
};

export type ChartPoint = {
  x: number;
  y: number;
  label: string;
  value: number;
};

export type ActiveUserRow = {
  user_id: string;
};

export type ChartMetric = "readiness" | "activity";
