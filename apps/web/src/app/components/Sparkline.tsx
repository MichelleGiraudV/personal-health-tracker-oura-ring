type SparklineProps = {
  values: number[];
  stroke: string;
};

export function Sparkline({ values, stroke }: SparklineProps) {
  if (values.length < 2) {
    return <div className="h-10 w-full rounded-lg bg-zinc-100" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 120;
  const height = 40;
  const padding = 4;

  const points = values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" role="img" aria-label="Sparkline">
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={points} />
    </svg>
  );
}
