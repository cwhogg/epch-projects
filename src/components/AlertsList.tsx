'use client';

import { PerformanceAlert, AlertSeverity } from '@/types';

function severityConfig(severity: AlertSeverity) {
  switch (severity) {
    case 'positive':
      return {
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.3)',
        color: '#34d399',
        label: 'Positive',
      };
    case 'warning':
      return {
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.3)',
        color: '#f87171',
        label: 'Warning',
      };
    case 'info':
      return {
        bg: 'rgba(96, 165, 250, 0.15)',
        border: 'rgba(96, 165, 250, 0.3)',
        color: '#60a5fa',
        label: 'Info',
      };
  }
}

export default function AlertsList({ alerts }: { alerts: PerformanceAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="card-static p-6 text-center">
        <p style={{ color: 'var(--text-muted)' }}>No alerts this week.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const config = severityConfig(alert.severity);
        return (
          <div
            key={`${alert.pieceSlug}-${alert.metric}-${i}`}
            className="card-static p-4 flex items-start gap-3"
            style={{ borderLeft: `3px solid ${config.color}` }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
              style={{
                background: config.bg,
                color: config.color,
                border: `1px solid ${config.border}`,
              }}
            >
              {config.label}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {alert.pieceTitle}
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {alert.message}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
