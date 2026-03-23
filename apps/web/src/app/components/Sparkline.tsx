type SparklineProps = {
  values: number[];
  stroke: string;
};

export function Sparkline({ values, stroke }: SparklineProps) {
  if (values.length < 2) {
    return <div className="h-28 w-full rounded-lg bg-zinc-100" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 350;
  const height = 132;
  const leftPadding = 36;
  const rightPadding = 14;
  const topPadding = 10;
  const bottomPadding = 28;
  const chartWidth = width - leftPadding - rightPadding;
  const chartHeight = height - topPadding - bottomPadding;

  const points = values
    .map((value, index) => {
      const x = leftPadding + (index / (values.length - 1)) * chartWidth;
      const y = topPadding + (1 - (value - min) / range) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const mid = min + range / 2;
  const yTicks = [max, mid, min];
  const formatTick = (value: number) => {
    if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
    if (Number.isInteger(value)) return `${Math.round(value)}`;
    return value.toFixed(1);
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label="Sparkline">
      <line
        x1={leftPadding}
        y1={topPadding + chartHeight}
        x2={width - rightPadding}
        y2={topPadding + chartHeight}
        stroke="#d4d4d8"
        strokeWidth="1"
      />
      <line
        x1={leftPadding}
        y1={topPadding}
        x2={leftPadding}
        y2={topPadding + chartHeight}
        stroke="#d4d4d8"
        strokeWidth="1"
      />
      {yTicks.map((tick, index) => {
        const y =
          yTicks.length <= 1
            ? topPadding + chartHeight / 2
            : topPadding + (index / (yTicks.length - 1)) * chartHeight;
        return (
          <g key={`y-tick-${tick}-${index}`}>
            <line x1={leftPadding - 3} y1={y} x2={leftPadding} y2={y} stroke="#a1a1aa" strokeWidth="1" />
            <text x={leftPadding - 8} y={y + 4} textAnchor="end" className="fill-zinc-500 text-[9px]">
              {formatTick(tick)}
            </text>
          </g>
        );
      })}
      <line
        x1={leftPadding}
        y1={topPadding + chartHeight}
        x2={leftPadding}
        y2={topPadding + chartHeight + 3}
        stroke="#a1a1aa"
        strokeWidth="1"
      />
      <line
        x1={width - rightPadding}
        y1={topPadding + chartHeight}
        x2={width - rightPadding}
        y2={topPadding + chartHeight + 3}
        stroke="#a1a1aa"
        strokeWidth="1"
      />
      <text x={leftPadding} y={height - 6} textAnchor="start" className="fill-zinc-500 text-[9px]">
        Start
      </text>
      <text x={width - rightPadding} y={height - 6} textAnchor="end" className="fill-zinc-500 text-[9px]">
        Now
      </text>
      <polyline fill="none" stroke={stroke} strokeWidth="2.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
