'use client';

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface WeeklyChartData {
  weekId: string;
  sites: { [siteName: string]: number };
  totalImpressions: number;
}

interface ChartDataPoint {
  weekId: string;
  [siteName: string]: string | number;
}

// Color palette for stacked bars
const COLORS = [
  '#ff6b5b', // coral
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#60a5fa', // blue
  '#f472b6', // pink
  '#38bdf8', // sky
  '#a78bfa', // purple-light
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg max-w-xs"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
      }}
    >
      <p className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
        {label}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} className="truncate" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
      <p className="mt-1 pt-1 font-medium" style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--border-subtle)' }}>
        Total: {total.toLocaleString()}
      </p>
    </div>
  );
}

export default function ImpressionsChart({ ideaId }: { ideaId?: string }) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [sites, setSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChartData() {
      setLoading(true);
      setError(null);
      try {
        const url = ideaId
          ? `/api/analytics/chart?ideaId=${encodeURIComponent(ideaId)}`
          : '/api/analytics/chart';
        const res = await fetch(url);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch');
        }
        const data = await res.json();

        // Transform data for Recharts
        const transformed: ChartDataPoint[] = data.chartData.map((week: WeeklyChartData) => ({
          weekId: week.weekId.replace('2026-', ''), // Shorter label
          ...week.sites,
        }));

        setChartData(transformed);
        setSites(data.sites);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart');
      } finally {
        setLoading(false);
      }
    }

    fetchChartData();
  }, [ideaId]);

  if (loading) {
    return (
      <div className="card-static p-5 sm:p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading chart...</div>
        </div>
      </div>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <div className="card-static p-5 sm:p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {error || 'No weekly data available yet.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-static p-5 sm:p-6">
      <h2
        className="font-display text-base mb-4 flex items-center gap-2"
        style={{ color: 'var(--text-primary)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
        Impressions by Week
      </h2>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="weekId"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-default)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={55}
              tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
            />
            <Tooltip content={<CustomTooltip />} />
            {sites.length <= 6 && (
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                formatter={(value) => (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {value.length > 20 ? value.slice(0, 17) + '...' : value}
                  </span>
                )}
              />
            )}
            {sites.map((site, index) => (
              <Bar
                key={site}
                dataKey={site}
                stackId="impressions"
                fill={COLORS[index % COLORS.length]}
                radius={index === sites.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
