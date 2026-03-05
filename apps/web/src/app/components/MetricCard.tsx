"use client";

import { motion } from "framer-motion";
import { Sparkline } from "./Sparkline";
import { BatteryCharging, MoonStar, HeartPulse, Footprints } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  subtext: string;
  tag?: string;
  tone?: "neutral" | "good" | "warn";
  message?: string;
  sparklineValues: number[];
  index?: number;
  iconName?: "recovery" | "sleep" | "hrv" | "steps";
};

const iconMap = {
  recovery: BatteryCharging,
  sleep: MoonStar,
  hrv: HeartPulse,
  steps: Footprints,
} as const;

const toneClass: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  neutral: "bg-zinc-100 text-zinc-700",
  good: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
};

export function MetricCard({
  label,
  value,
  subtext,
  tag,
  tone = "neutral",
  message,
  sparklineValues,
  iconName,
}: MetricCardProps) {
  const Icon = iconName ? iconMap[iconName] : null;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="mx-2 my-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-zinc-500" /> : null}
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        </div>
        {tag ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneClass[tone]}`}>{tag}</span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-zinc-900">{value}</p>
        <p className="mt-1 text-sm text-zinc-600">{subtext}</p>
      {message ? (
        <p className="mt-2 text-sm text-zinc-500">{message}</p>
      ) : null}
      <div className="mt-4">
        <Sparkline values={sparklineValues} stroke="#3b82f6" />
      </div>
    </motion.article>
  );
}
