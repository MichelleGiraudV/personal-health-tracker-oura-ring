import type { ReactNode } from "react";

type InsightCardProps = {
  title: string;
  body: ReactNode;
  index?: number;
};

export function InsightCard({ title, body }: InsightCardProps) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-transform duration-200 hover:scale-[1.01]">
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
    </article>
  );
}
