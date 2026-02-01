'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { GSCDateRow } from '@/types';

interface AnalyticsChartProps {
  timeSeries: GSCDateRow[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; dataKey: string; color: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
      }}
    >
      <p className="mb-1 font-medium" style={{ color: 'var(--text-primary)' }}>
        {label}
      </p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.dataKey === 'clicks' ? 'Clicks' : 'Impressions'}:{' '}
          {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsChart({ timeSeries }: AnalyticsChartProps) {
  const [showClicks, setShowClicks] = useState(true);
  const [showImpressions, setShowImpressions] = useState(true);

  const data = timeSeries.map((row) => ({
    ...row,
    date: row.date.slice(5), // MM-DD format
  }));

  return (
    <div className="card-static p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-display text-base flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Performance Over Time
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={showClicks}
              onChange={(e) => setShowClicks(e.target.checked)}
              className="accent-[#ff6b5b]"
            />
            <span style={{ color: '#ff6b5b' }}>Clicks</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={showImpressions}
              onChange={(e) => setShowImpressions(e.target.checked)}
              className="accent-[#8b5cf6]"
            />
            <span style={{ color: '#8b5cf6' }}>Impressions</span>
          </label>
        </div>
      </div>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-default)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="clicks"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <YAxis
              yAxisId="impressions"
              orientation="right"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            {showClicks && (
              <Line
                yAxisId="clicks"
                type="monotone"
                dataKey="clicks"
                stroke="#ff6b5b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#ff6b5b' }}
              />
            )}
            {showImpressions && (
              <Line
                yAxisId="impressions"
                type="monotone"
                dataKey="impressions"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#8b5cf6' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
