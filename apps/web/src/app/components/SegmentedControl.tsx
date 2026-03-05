"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { motion } from "framer-motion";

type SegmentedControlProps = {
  label: string;
  options: Array<{ label: string; value: string }>;
  selectedValue: string;
  queryKey: "range" | "metric";
};

export function SegmentedControl({
  label,
  options,
  selectedValue,
  queryKey,
}: SegmentedControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onSelect = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(queryKey, value);
    const nextRoute = `${pathname}?${params.toString()}` as Route;
    router.replace(nextRoute);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <div className="inline-flex rounded-2xl bg-zinc-100 p-1">
        {options.map((option) => {
          const isActive = option.value === selectedValue;
          return (
            <div key={option.value} className="relative">
              {isActive ? (
                <motion.div
                  layoutId={`segmented-pill-${queryKey}`}
                  className="absolute inset-0 rounded-xl bg-white shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(option.value)}
                className={`relative z-10 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                  isActive ? "text-zinc-900" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {option.label}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
