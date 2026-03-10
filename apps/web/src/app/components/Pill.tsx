type PillProps = {
  children: string;
  tone?: "neutral" | "good" | "warn";
};

const toneClass: Record<NonNullable<PillProps["tone"]>, string> = {
  neutral: "bg-zinc-100 text-zinc-700",
  good: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
};

export function Pill({ children, tone = "neutral" }: PillProps) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
