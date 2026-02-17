export default function SummaryCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xl font-display" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {subtitle && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
    </div>
  );
}
