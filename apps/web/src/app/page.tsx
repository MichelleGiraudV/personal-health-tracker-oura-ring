import { query } from "@/lib/db";
import { DailySummaryRow, LastSyncedRow, ActiveUserRow, ChartMetric, DailySummaryRowNormalized } from "./types/types.home";
import { formatDay, formatSleep, formatTimestamp, buildLineChartPoints, getRecoveryLabel, getRecoveryTone,formatSteps, formatHrv, formatBpm, getSleepTone, getHrvSignal, toNumber  } from "./helpers/home.helper";
import { MetricCard } from "./components/MetricCard";
import { Pill } from "./components/Pill";
import { SegmentedControl } from "./components/SegmentedControl";
import { InsightCard } from "./components/InsightCard";

function getBand(
  value: number | null,
  goodThreshold: number,
  lowThreshold: number,
  goodLabel = "High",
  midLabel = "Normal",
  lowLabel = "Low"
) {
  if (value === null) return "No data";
  if (value >= goodThreshold) return goodLabel;
  if (value <= lowThreshold) return lowLabel;
  return midLabel;
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; metric?: string }>;
}) {
  const resolvedSearchParams = await searchParams;

  const activeUserRes = await query<ActiveUserRow>(
    `select user_id
     from oura_token
     order by updated_at desc
     limit 1`
  );

  const activeUserId = activeUserRes.rows[0]?.user_id ?? null;
  const allowedRanges = [7, 14, 30, 90];
  const parsedRange = Number(resolvedSearchParams?.range);
  const range = allowedRanges.includes(parsedRange) ? parsedRange : 14;
  const chartMetric: ChartMetric = resolvedSearchParams?.metric === "activity" ? "activity" : "readiness";

  // Fetch ML Prediction from our Python API
  let predictedReadinessTomorrow: number | null = null;
  if (activeUserId) {
    try {
      const predRes = await fetch(`http://localhost:8000/predict-readiness?user_id=${activeUserId}`, {
        cache: "no-store", // We don't want Next.js to cache stale ML predictions
      });
      if (predRes.ok) {
        const body = await predRes.json();
        predictedReadinessTomorrow = body.predicted_readiness_tomorrow ?? null;
      }
    } catch (error) {
      console.error("Machine Learning API fetch failed (Make sure the uvicorn server is running):", error);
    }
  }

  const latestRes = activeUserId
    ? await query<DailySummaryRow>(
        `select day, sleep_total_seconds, readiness_score, steps, activity_score, hrv_avg_ms, resting_hr_bpm,
                stress_high_minutes, recovery_high_minutes, stress_day_summary
         from daily_summary
         where user_id = $1
         order by day desc
         limit 1`,
        [activeUserId]
      )
    : { rows: [] };

  const lastSyncedRes = activeUserId
    ? await query<LastSyncedRow>(
        `select max(updated_at) as last_synced_at
         from daily_summary
         where user_id = $1`,
        [activeUserId]
      )
    : { rows: [] };

  const historyRes = activeUserId
    ? await query<DailySummaryRow>(
        `select day, sleep_total_seconds, readiness_score, steps, activity_score, hrv_avg_ms, resting_hr_bpm,
                stress_high_minutes, recovery_high_minutes, stress_day_summary
         from daily_summary
         where user_id = $1
         order by day desc
         limit 7`,
        [activeUserId]
      )
    : { rows: [] };

  const chartRes = activeUserId
    ? await query<DailySummaryRow>(
        `select day, sleep_total_seconds, readiness_score, steps, activity_score, hrv_avg_ms, resting_hr_bpm,
                stress_high_minutes, recovery_high_minutes, stress_day_summary
         from daily_summary
         where user_id = $1
         order by day desc
         limit $2`,
        [activeUserId, range]
      )
    : { rows: [] };

  const latestRaw = latestRes.rows[0] ?? null;
  const latest: DailySummaryRowNormalized | null = latestRaw
    ? {
        day: latestRaw.day,
        sleep_total_seconds: toNumber(latestRaw.sleep_total_seconds),
        readiness_score: toNumber(latestRaw.readiness_score),
        steps: toNumber(latestRaw.steps),
        activity_score: toNumber(latestRaw.activity_score),
        hrv_avg_ms: toNumber(latestRaw.hrv_avg_ms),
        resting_hr_bpm: toNumber(latestRaw.resting_hr_bpm),
        stress_high_minutes: toNumber(latestRaw.stress_high_minutes),
        recovery_high_minutes: toNumber(latestRaw.recovery_high_minutes), 
        stress_day_summary:
          typeof latestRaw.stress_day_summary === "string" ? latestRaw.stress_day_summary : null


      }
    : null;
  const lastSynced = lastSyncedRes.rows[0]?.last_synced_at ?? null;
  const chartRowsRaw = chartRes.rows;
  const chartRowsN: DailySummaryRowNormalized[] = chartRowsRaw.map((r) => ({
    ...r,
    sleep_total_seconds: toNumber(r.sleep_total_seconds),
    readiness_score: toNumber(r.readiness_score),
    steps: toNumber(r.steps),
    activity_score: toNumber(r.activity_score),
    hrv_avg_ms: toNumber(r.hrv_avg_ms),
    resting_hr_bpm: toNumber(r.resting_hr_bpm),
    stress_high_minutes: toNumber(r.stress_high_minutes),
    recovery_high_minutes: toNumber(r.recovery_high_minutes),
    stress_day_summary: typeof r.stress_day_summary === "string" ? r.stress_day_summary : null

  }));
  const historyRowsN: DailySummaryRowNormalized[] = historyRes.rows.map((r) => ({
    ...r,
    sleep_total_seconds: toNumber(r.sleep_total_seconds),
    readiness_score: toNumber(r.readiness_score),
    steps: toNumber(r.steps),
    activity_score: toNumber(r.activity_score),
    hrv_avg_ms: toNumber(r.hrv_avg_ms),
    resting_hr_bpm: toNumber(r.resting_hr_bpm),
    stress_high_minutes: toNumber(r.stress_high_minutes),
    recovery_high_minutes: toNumber(r.recovery_high_minutes),
    stress_day_summary: typeof r.stress_day_summary === "string" ? r.stress_day_summary : null,
  }));
  const latestSleepRow = chartRowsN.find((row) => row.sleep_total_seconds !== null) ?? null;
  const latestStepsRow = chartRowsN.find((row) => row.steps !== null) ?? null;
  const latestHrvRow = chartRowsN.find((row) => row.hrv_avg_ms !== null);
  const latestStressRow = chartRowsN.find((row) => row.stress_high_minutes !== null) ?? null;

  const chartWidth = 720;
  const chartHeight = 260;
  const chartPadding = 24;
  const recoveryChart = buildLineChartPoints(
    chartRowsN,
    (row) => (chartMetric === "readiness" ? row.readiness_score : row.activity_score),
    chartWidth,
    chartHeight
  );
  const sleepChart = buildLineChartPoints(
    chartRowsN,
    (row) => row.sleep_total_seconds,
    chartWidth,
    chartHeight
  );

  const readinessValues = [...chartRowsN].reverse().map((row) => row.readiness_score).filter((v): v is number => v !== null);
  const sleepValues = [...chartRowsN]
    .reverse()
    .map((row) => row.sleep_total_seconds)
    .filter((v): v is number => v !== null);
  const stepsValues = [...chartRowsN].reverse().map((row) => row.steps).filter((v): v is number => v !== null);
  const hrvValues = [...chartRowsN].reverse().map(r => r.hrv_avg_ms).filter((v): v is number => v !== null);
  const stressValues = [...chartRowsN]
    .reverse()
    .map((row) => row.stress_high_minutes)
    .filter((v): v is number => v !== null);
  const recoveryValues = [...chartRowsN]
    .reverse()
    .map((row) => (chartMetric === "readiness" ? row.readiness_score : row.activity_score))
    .filter((v): v is number => v !== null);

  const latestReadiness = latest?.readiness_score ?? null;
  const latestHrv = latestHrvRow?.hrv_avg_ms ?? null;
  const latestStressHigh = latestStressRow?.stress_high_minutes ?? null;
  const hrvBaseline =
    hrvValues.length > 0 ? Math.round(hrvValues.reduce((sum, value) => sum + value, 0) / hrvValues.length) : null;
  const sleepBaselineSeconds =
    sleepValues.length > 0 ? Math.round(sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length) : null;
  const stressBaseline =
    stressValues.length > 0 ? Math.round(stressValues.reduce((sum, value) => sum + value, 0) / stressValues.length) : null;

  const hrvDelta = latestHrv !== null && hrvBaseline !== null ? Math.round(latestHrv - hrvBaseline) : null;
  const sleepDeltaSeconds =
    latestSleepRow?.sleep_total_seconds !== null &&
    latestSleepRow?.sleep_total_seconds !== undefined &&
    sleepBaselineSeconds !== null
      ? latestSleepRow.sleep_total_seconds - sleepBaselineSeconds
      : null;
  const stressDelta =
    latestStressHigh !== null && stressBaseline !== null ? latestStressHigh - stressBaseline : null;

  const hrvSignal = getHrvSignal(latestHrv, hrvBaseline);

  const summaryLine =
    latestReadiness === null || latestHrv === null || hrvBaseline === null
      ? "Sync once to get your daily recovery story."
      : latestReadiness >= 80 && latestHrv >= hrvBaseline
      ? "Your recovery looks strong because HRV is above baseline and sleep is on target."
      : latestReadiness >= 60 && latestHrv > hrvBaseline - 5
      ? "Recovery looks okay. Keep effort moderate and stay consistent tonight."
      : "Recovery is lower today because HRV dipped and your system needs a lighter day.";

  const recoveryLabel = getRecoveryLabel(latestReadiness);
  const recoveryTone = getRecoveryTone(latestReadiness);

  const rangeOptions = allowedRanges.map((days) => ({ label: `${days}D`, value: String(days) }));
  const metricOptions = [
    { label: "Readiness", value: "readiness" },
    { label: "Activity", value: "activity" },
  ];

  const actionCard =
    latestReadiness !== null && latestReadiness >= 80 && hrvSignal.label !== "Low"
      ? "Great day for strength or higher intensity training."
      : latestReadiness !== null && latestReadiness >= 60
      ? "Keep it light: easy cardio, walk, and mobility work."
      : "Recovery day: reduce strain and prioritize sleep tonight.";

  const recoveryState = getBand(latestReadiness, 75, 60, "High", "Normal", "Low");
  const sleepState = getBand(
    latestSleepRow?.sleep_total_seconds ?? null,
    7 * 3600,
    6 * 3600,
    "On target",
    "Normal",
    "Low"
  );
  const stressState =
    latestStressHigh === null
      ? "No data"
      : latestStressHigh >= 120
      ? "High"
      : latestStressHigh >= 60
      ? "Balanced"
      : "Low";
  const activityState =
    latestStepsRow?.steps === null || latestStepsRow?.steps === undefined
      ? "No data"
      : latestStepsRow.steps >= 10000
      ? "High"
      : latestStepsRow.steps >= 7000
      ? "Moderate"
      : "Low";
  const overallState =
    latestReadiness !== null && latestReadiness >= 75 && sleepState !== "Low" && stressState !== "High"
      ? "Ready"
      : latestReadiness !== null && latestReadiness >= 60
      ? "Slight fatigue"
      : "Recovery needed";

  const sleepConsistencyCount = historyRowsN.filter(
    (row) => row.sleep_total_seconds !== null && row.sleep_total_seconds >= 7 * 3600
  ).length;

  const bodyFlags = [
    hrvDelta !== null && hrvDelta <= -5 ? "HRV below baseline" : null,
    sleepDeltaSeconds !== null && sleepDeltaSeconds <= -30 * 60 ? "Sleep debt" : null,
    latestStepsRow?.steps !== null && latestStepsRow?.steps !== undefined && latestStepsRow.steps < 6000
      ? "Low steps streak"
      : null,
    stressDelta !== null && stressDelta >= 30 ? "High stress load" : null,
    latestReadiness !== null && latestReadiness < 60 ? "Low recovery day" : null,
  ].filter((flag): flag is string => flag !== null);

  const insights = [
    {
      title: "Action for today",
      body: actionCard,
    },
    {
      title: "Consistency",
      body: `Days with sleep >= 7h in last 7 days: ${sleepConsistencyCount}/7.`,
    },
    ...(predictedReadinessTomorrow !== null
      ? [
          {
            title: "🔮 AI Prediction for Tomorrow",
            body: (
              <>
                Based on your recent habits, our AI Model predicts your readiness score tomorrow will be{" "}
                <strong>{predictedReadinessTomorrow}</strong>. Try to prioritize sleep tonight!
              </>
            ),
          },
        ]
      : []),
  ];

  const getYAxisTicks = (values: number[]) => {
    if (values.length === 0) return [] as number[];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mid = (min + max) / 2;
    return [max, mid, min].map((v) => Math.round(v * 10) / 10);
  };

  const recoveryYAxisTicks = getYAxisTicks(recoveryValues);
  const sleepYAxisTicks = getYAxisTicks(sleepValues.map((v) => v / 3600));

  const xLabelPoints = (points: Array<{ x: number; label: string }>) => {
    if (points.length === 0) return [] as Array<{ x: number; label: string }>;
    if (points.length <= 3) return points.map((p) => ({ x: p.x, label: p.label.slice(5) }));
    const first = points[0];
    const middle = points[Math.floor(points.length / 2)];
    const last = points[points.length - 1];
    return [first, middle, last].map((p) => ({ x: p.x, label: p.label.slice(5) }));
  };

  const recoveryXLabels = xLabelPoints(recoveryChart.points);
  const sleepXLabels = xLabelPoints(sleepChart.points);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f1f5f9_0%,_#fafafa_40%,_#ffffff_100%)] px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Daily dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Hey Michelle</h1>
              <p className="mt-1 text-sm text-zinc-600">Last synced: {formatTimestamp(lastSynced)}</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <SegmentedControl
                label="Window"
                options={rangeOptions}
                selectedValue={String(range)}
                queryKey="range"
              />
              <a
                className="inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                href="/api/oura/sync?days=7"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sync 7D
              </a>
            </div>
          </div>
        </header>

        {!latest ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-700">No data yet. Connect Oura first, then run sync.</p>
          </section>
        ) : (
          <>
            <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                index={0}
                label="Today Recovery"
                value={latestReadiness === null ? "-" : `Recovery: ${latestReadiness}`}
                subtext={summaryLine}
                tag={recoveryLabel}
                tone={recoveryTone}
                message={`Latest day: ${formatDay(latest.day)}`}
                sparklineValues={readinessValues}
                iconName="recovery"
              />
              <MetricCard
                index={1}
                label="Sleep"
                value={formatSleep(latestSleepRow?.sleep_total_seconds ?? null)}
                subtext={
                  sleepDeltaSeconds === null
                    ? latestSleepRow
                      ? `Latest available: ${formatDay(latestSleepRow.day)}`
                      : "No recent sleep value"
                    : `${sleepDeltaSeconds > 0 ? "+" : ""}${formatSleep(Math.abs(sleepDeltaSeconds))} vs ${range}D baseline`
                }
                tag={
                  latestSleepRow?.sleep_total_seconds
                    ? latestSleepRow.sleep_total_seconds >= 7 * 3600
                      ? "On target"
                      : "Low sleep"
                    : "No data"
                }
                tone={getSleepTone(latestSleepRow?.sleep_total_seconds ?? null)}
                sparklineValues={sleepValues}
                iconName="sleep"
              />
              <MetricCard
                index={2}
                label="HRV (Recovery Signal)"
                value={hrvSignal.label}
                subtext={
                  hrvDelta === null
                    ? `${formatHrv(latestHrv)}`
                    : `${formatHrv(latestHrv)} (${hrvDelta > 0 ? "+" : ""}${hrvDelta} vs baseline)`
                }
                tag={hrvSignal.label === "No data" ? "No baseline" : `${hrvSignal.label} signal`}
                tone={hrvSignal.tone}
                message={hrvSignal.message}
                sparklineValues={hrvValues}
                iconName="hrv"
              />
              <MetricCard
                index={3}
                label="Steps"
                value={formatSteps(latestStepsRow?.steps ?? null)}
                subtext={latestStepsRow ? `Latest available: ${formatDay(latestStepsRow.day)}` : "No recent steps value"}
                tag={
                  latestStepsRow?.steps === null || latestStepsRow?.steps === undefined
                    ? "No data"
                    : latestStepsRow.steps >= 10000
                    ? "High strain"
                    : "Build momentum"
                }
                tone={
                  latestStepsRow?.steps === null || latestStepsRow?.steps === undefined
                    ? "neutral"
                    : latestStepsRow.steps >= 10000
                    ? "good"
                    : "neutral"
                }
                sparklineValues={stepsValues}
                iconName="steps"
              />
              <MetricCard
                index={4}
                label="Stress High"
                value={latestStressHigh === null ? "-" : `${latestStressHigh} min`}
                subtext={
                  stressDelta === null
                    ? latestStressRow
                      ? `Latest available: ${formatDay(latestStressRow.day)}`
                      : "No recent stress value"
                    : `${stressDelta > 0 ? "+" : ""}${stressDelta} min vs ${range}D baseline`
                }
                tag={
                  latestStressHigh === null
                    ? "No data"
                    : latestStressHigh >= 120
                    ? "High stress"
                    : "Balanced"
                }
                tone={
                  latestStressHigh === null
                    ? "neutral"
                    : latestStressHigh >= 120
                    ? "warn"
                    : "good"
                }
                message={latestStressRow?.stress_day_summary ?? undefined}
                sparklineValues={stressValues}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Recovery trend</h2>
                    <p className="mt-1 text-sm text-zinc-600">Readiness and activity across {range} days.</p>
                  </div>
                  <SegmentedControl
                    label="Metric"
                    options={metricOptions}
                    selectedValue={chartMetric}
                    queryKey="metric"
                  />
                </div>
                {recoveryChart.points.length === 0 ? (
                  <p className="mt-5 text-sm text-zinc-600">No recovery data available yet.</p>
                ) : (
                  <div className="mt-4">
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="h-56 w-full"
                      role="img"
                      aria-label="Recovery trend line chart"
                    >
                      <line
                        x1={chartPadding}
                        y1={chartHeight - chartPadding}
                        x2={chartWidth - chartPadding}
                        y2={chartHeight - chartPadding}
                        stroke="#d4d4d8"
                      />
                      <line
                        x1={chartPadding}
                        y1={chartPadding}
                        x2={chartPadding}
                        y2={chartHeight - chartPadding}
                        stroke="#d4d4d8"
                      />
                      {recoveryYAxisTicks.map((tick, index) => {
                        const y =
                          recoveryYAxisTicks.length <= 1
                            ? chartHeight / 2
                            : chartPadding +
                              (index / (recoveryYAxisTicks.length - 1)) * (chartHeight - chartPadding * 2);
                        return (
                          <g key={`recovery-y-tick-${tick}-${index}`}>
                            <line x1={chartPadding - 4} y1={y} x2={chartPadding} y2={y} stroke="#9ca3af" />
                            <text x={chartPadding - 8} y={y + 4} textAnchor="end" className="fill-zinc-500 text-[10px]">
                              {tick}
                            </text>
                          </g>
                        );
                      })}
                      {recoveryXLabels.map((point, index) => (
                        <g key={`recovery-x-label-${point.label}-${index}`}>
                          <line
                            x1={point.x}
                            y1={chartHeight - chartPadding}
                            x2={point.x}
                            y2={chartHeight - chartPadding + 4}
                            stroke="#9ca3af"
                          />
                          <text
                            x={point.x}
                            y={chartHeight - chartPadding + 14}
                            textAnchor="middle"
                            className="fill-zinc-500 text-[10px]"
                          >
                            {point.label}
                          </text>
                        </g>
                      ))}
                      <polyline
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                        points={recoveryChart.polyline}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {recoveryChart.points.map((point, index) => (
                        <g key={`recovery-${point.label}-${index}`}>
                          <circle cx={point.x} cy={point.y} r="4" fill="#2563eb" />
                          <title>{`${point.label}: ${point.value}`}</title>
                        </g>
                      ))}
                    </svg>
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Sleep duration</h2>
                <p className="mt-1 text-sm text-zinc-600">Sleep hours across {range} days.</p>
                {sleepChart.points.length === 0 ? (
                  <p className="mt-5 text-sm text-zinc-600">No sleep data available yet.</p>
                ) : (
                  <div className="mt-4">
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="h-56 w-full"
                      role="img"
                      aria-label="Sleep trend line chart"
                    >
                      <line
                        x1={chartPadding}
                        y1={chartHeight - chartPadding}
                        x2={chartWidth - chartPadding}
                        y2={chartHeight - chartPadding}
                        stroke="#d4d4d8"
                      />
                      <line
                        x1={chartPadding}
                        y1={chartPadding}
                        x2={chartPadding}
                        y2={chartHeight - chartPadding}
                        stroke="#d4d4d8"
                      />
                      {sleepYAxisTicks.map((tick, index) => {
                        const y =
                          sleepYAxisTicks.length <= 1
                            ? chartHeight / 2
                            : chartPadding + (index / (sleepYAxisTicks.length - 1)) * (chartHeight - chartPadding * 2);
                        return (
                          <g key={`sleep-y-tick-${tick}-${index}`}>
                            <line x1={chartPadding - 4} y1={y} x2={chartPadding} y2={y} stroke="#9ca3af" />
                            <text x={chartPadding - 8} y={y + 4} textAnchor="end" className="fill-zinc-500 text-[10px]">
                              {tick}h
                            </text>
                          </g>
                        );
                      })}
                      {sleepXLabels.map((point, index) => (
                        <g key={`sleep-x-label-${point.label}-${index}`}>
                          <line
                            x1={point.x}
                            y1={chartHeight - chartPadding}
                            x2={point.x}
                            y2={chartHeight - chartPadding + 4}
                            stroke="#9ca3af"
                          />
                          <text
                            x={point.x}
                            y={chartHeight - chartPadding + 14}
                            textAnchor="middle"
                            className="fill-zinc-500 text-[10px]"
                          >
                            {point.label}
                          </text>
                        </g>
                      ))}
                      <polyline
                        fill="none"
                        stroke="#059669"
                        strokeWidth="3"
                        points={sleepChart.polyline}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {sleepChart.points.map((point, index) => (
                        <g key={`sleep-${point.label}-${index}`}>
                          <circle cx={point.x} cy={point.y} r="4" fill="#059669" />
                          <title>{`${point.label}: ${formatSleep(point.value)}`}</title>
                        </g>
                      ))}
                    </svg>
                  </div>
                )}
              </article>
            </section>

            <section className="space-y-3">
              <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Body status</p>
                <h3 className="mt-2 text-xl font-semibold text-zinc-900">Body Status Today</h3>
                <div className="mt-4 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
                  <p>Recovery: <span className="font-semibold text-zinc-900">{recoveryState}</span></p>
                  <p>Sleep: <span className="font-semibold text-zinc-900">{sleepState}</span></p>
                  <p>Stress: <span className="font-semibold text-zinc-900">{stressState}</span></p>
                  <p>Activity: <span className="font-semibold text-zinc-900">{activityState}</span></p>
                </div>
                <p className="mt-4 text-sm text-zinc-700">
                  Overall signal: <span className="font-semibold text-zinc-900">{overallState}</span>
                </p>
                <p className="mt-1 text-sm text-zinc-600">Recommendation: {actionCard}</p>
              </article>

              <h2 className="text-xl font-semibold">Insights</h2>
              <div className="flex flex-wrap gap-2">
                {bodyFlags.length === 0 ? (
                  <Pill tone="good">No body flags</Pill>
                ) : (
                  bodyFlags.map((flag) => (
                    <Pill key={flag} tone="warn">
                      {flag}
                    </Pill>
                  ))
                )}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {insights.map((insight, index) => (
                  <InsightCard key={insight.title} index={index} title={insight.title} body={insight.body} />
                ))}
              </div>
            </section>

            <details className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <summary className="cursor-pointer list-none text-xl font-semibold">
                Details (last 7 days)
              </summary>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-zinc-600">
                      <th className="py-2 pr-4">Day</th>
                      <th className="py-2 pr-4">Sleep</th>
                      <th className="py-2 pr-4">Readiness</th>
                      <th className="py-2 pr-4">HRV</th>
                      <th className="py-2 pr-4">RHR</th>
                      <th className="py-2 pr-4">Stress High</th>
                      <th className="py-2 pr-4">Recovery High</th>
                      <th className="py-2 pr-4">Stress Summary</th>
                      <th className="py-2 pr-4">Activity</th>
                      <th className="py-2 pr-4">Steps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRowsN.map((row: DailySummaryRowNormalized, index: number) => (
                      <tr key={`${formatDay(row.day)}-${index}`} className="border-b border-zinc-100">
                        <td className="py-2 pr-4">{formatDay(row.day)}</td>
                        <td className="py-2 pr-4">{formatSleep(row.sleep_total_seconds)}</td>
                        <td className="py-2 pr-4">{row.readiness_score ?? "-"}</td>
                        <td className="py-2 pr-4">{formatHrv(row.hrv_avg_ms)}</td>
                        <td className="py-2 pr-4">{formatBpm(row.resting_hr_bpm)}</td>
                        <td className="py-2 pr-4">{row.stress_high_minutes ?? "-"}</td>
                        <td className="py-2 pr-4">{row.recovery_high_minutes ?? "-"}</td>
                        <td className="py-2 pr-4">{row.stress_day_summary ?? "-"}</td>
                        <td className="py-2 pr-4">{row.activity_score ?? "-"}</td>
                        <td className="py-2 pr-4">{formatSteps(row.steps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
