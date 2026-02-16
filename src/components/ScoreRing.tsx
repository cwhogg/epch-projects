export default function ScoreRing({ score, label, size = 72 }: { score: number | null; label: string; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = score !== null ? score / 10 : 0;
  const offset = circumference - percent * circumference;

  const getColor = () => {
    if (score === null) return 'var(--text-muted)';
    if (score >= 7) return 'var(--accent-emerald)';
    if (score >= 4) return 'var(--accent-amber)';
    return 'var(--color-danger)';
  };

  const getGlow = () => {
    if (score === null || score < 7) return 'none';
    return `drop-shadow(0 0 6px ${getColor()}50)`;
  };

  return (
    <div className="flex flex-col items-center gap-2 group">
      <div
        className="relative transition-transform duration-200 group-hover:scale-105"
        style={{ width: size, height: size, filter: getGlow() }}
      >
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth={strokeWidth}
          />
          {score !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={getColor()}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          )}
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center font-display font-semibold"
          style={{ fontSize: size * 0.35, color: score !== null ? getColor() : 'var(--text-muted)' }}
        >
          {score !== null ? score : '?'}
        </div>
      </div>
      <span className="text-xs text-center transition-colors group-hover:text-[var(--text-secondary)]" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
