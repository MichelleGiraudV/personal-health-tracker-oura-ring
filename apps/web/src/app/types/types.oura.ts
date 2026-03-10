export type OuraTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
};

export type OuraDailySource =
  | "daily_sleep"
  | "daily_activity"
  | "daily_readiness"
  | "daily_stress"
  | "sleep";


export type DailySummaryAccumulator = {
  sleep_total_seconds?: number | null;
  sleep_efficiency?: number | null;
  sleep_latency_seconds?: number | null;
  readiness_score?: number | null;
  steps?: number | null;
  activity_score?: number | null;
  hrv_avg_ms?: number | null;
  resting_hr_bpm?: number | null;
  stress_high_minutes?: number | null;  
  recovery_high_minutes?:  number | null;
  stress_day_summary?: string | null;
};
