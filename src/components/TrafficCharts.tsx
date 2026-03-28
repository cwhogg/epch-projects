'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  PieLabelRenderProps,
} from 'recharts';

const SOURCE_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  google: '#4285F4',
  search_other: '#34A853',
  direct: '#94918C',
  referral: '#ff6b5b',
};

const SOURCE_LABELS: Record<string, string> = {
  twitter: 'Twitter/X',
  google: 'Google',
  search_other: 'Other Search',
  direct: 'Direct',
  referral: 'Referral',
};

interface DailyEntry {
  day: string;
  views: number;
  uniqueVisitors: number;
}

interface SourceEntry {
  source: string;
  views: number;
}

export default function TrafficCharts({
  daily,
  sources,
}: {
  daily: DailyEntry[];
  sources: SourceEntry[];
}) {
  const pieData = sources.map((s) => ({
    name: SOURCE_LABELS[s.source] || s.source,
    value: s.views,
    color: SOURCE_COLORS[s.source] || '#6B7280',
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Source pie chart */}
      <div className="card-static p-5">
        <h3 className="text-sm font-display mb-4" style={{ color: 'var(--text-primary)' }}>
          Traffic Sources
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={85}
              label={(props: PieLabelRenderProps) => `${props.name ?? ''} ${(((props.percent as number | undefined) ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
              style={{ fontSize: '11px' }}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-primary)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Daily views bar chart */}
      <div className="card-static p-5">
        <h3 className="text-sm font-display mb-4" style={{ color: 'var(--text-primary)' }}>
          Daily Page Views
        </h3>
        {daily.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="views" fill="var(--accent-coral)" name="Views" radius={[2, 2, 0, 0]} />
              <Bar dataKey="uniqueVisitors" fill="var(--text-muted)" name="Unique" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            No daily data
          </p>
        )}
      </div>
    </div>
  );
}
