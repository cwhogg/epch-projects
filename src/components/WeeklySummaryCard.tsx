export default function WeeklySummaryCard({
  label,
  value,
  change,
  format,
}: {
  label: string;
  value: number;
  change: number | null;
  format?: 'number' | 'position' | 'percent';
}) {
  const fmt = format ?? 'number';
  let display: string;
  if (fmt === 'percent') {
    display = `${(value * 100).toFixed(1)}%`;
  } else if (fmt === 'position') {
    display = value.toFixed(1);
  } else {
    display = value.toLocaleString();
  }

  let changeDisplay: React.ReactNode = null;
  if (change !== null && change !== 0) {
    const isGood = fmt === 'position' ? change < 0 : change > 0;
    const color = isGood ? '#34d399' : '#f87171';
    const arrow = isGood ? '↑' : '↓';
    const displayVal = fmt === 'percent'
      ? `${(Math.abs(change) * 100).toFixed(1)}%`
      : Math.abs(change).toLocaleString();
    changeDisplay = (
      <span className="text-sm ml-2" style={{ color }}>
        {arrow} {displayVal}
      </span>
    );
  }

  return (
    <div className="card-static p-4">
      <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-xl font-display" style={{ color: 'var(--text-primary)' }}>
        {display}
        {changeDisplay}
      </p>
    </div>
  );
}
