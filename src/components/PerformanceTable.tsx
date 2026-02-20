'use client';

import { useState } from 'react';
import { ContentType, PieceSnapshot } from '@/types';

interface PieceRow {
  slug: string;
  title: string;
  type: ContentType;
  current: PieceSnapshot;
  previous: PieceSnapshot | null;
  clicksChange: number | null;
  impressionsChange: number | null;
  positionChange: number | null;
}

type SortKey = 'clicks' | 'impressions' | 'position' | 'ctr';

function ChangeIndicator({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  if (value === 0) return <span style={{ color: 'var(--text-muted)' }}>0</span>;

  // For position, negative change is good (moved up in rankings)
  const isGood = invert ? value < 0 : value > 0;
  const color = isGood ? 'var(--accent-emerald)' : 'var(--color-danger)';
  const arrow = isGood ? (invert ? '↑' : '↑') : (invert ? '↓' : '↓');
  const display = invert ? Math.abs(value) : Math.abs(value);

  return (
    <span style={{ color, fontWeight: 500 }}>
      {arrow} {display}
    </span>
  );
}

export default function PerformanceTable({ pieces }: { pieces: PieceRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('clicks');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter to only show pieces with impressions > 0
  const withImpressions = pieces.filter((p) => p.current.impressions > 0);

  const sorted = [...withImpressions].sort((a, b) => {
    const aVal = a.current[sortKey];
    const bVal = b.current[sortKey];
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    const isActive = sortKey === field;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none"
        style={{ color: isActive ? 'var(--accent-coral)' : 'var(--text-muted)' }}
        onClick={() => handleSort(field)}
      >
        {label} {isActive ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    );
  }

  if (withImpressions.length === 0) {
    return (
      <div className="card-static p-8 text-center">
        <p style={{ color: 'var(--text-muted)' }}>
          {pieces.length === 0 ? 'No piece data available yet.' : 'No pieces with impressions yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card-static overflow-hidden">
      {/* Mobile: card list */}
      <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {sorted.map((piece) => (
          <div key={piece.slug} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                {piece.title}
              </h4>
              <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{
                background: 'var(--accent-coral-soft)',
                color: 'var(--accent-coral)',
              }}>
                {piece.type}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Clicks: </span>
                <span style={{ color: 'var(--text-primary)' }}>{piece.current.clicks}</span>
                {' '}<ChangeIndicator value={piece.clicksChange} />
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Impr: </span>
                <span style={{ color: 'var(--text-primary)' }}>{piece.current.impressions}</span>
                {' '}<ChangeIndicator value={piece.impressionsChange} />
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Pos: </span>
                <span style={{ color: 'var(--text-primary)' }}>{piece.current.position}</span>
                {' '}<ChangeIndicator value={piece.positionChange} invert />
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>CTR: </span>
                <span style={{ color: 'var(--text-primary)' }}>{(piece.current.ctr * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Piece
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Type
              </th>
              <SortHeader label="Clicks" field="clicks" />
              <SortHeader label="Impressions" field="impressions" />
              <SortHeader label="Position" field="position" />
              <SortHeader label="CTR" field="ctr" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((piece) => (
              <tr key={piece.slug} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="px-4 py-3">
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                    {piece.title}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded" style={{
                    background: 'var(--accent-coral-soft)',
                    color: 'var(--accent-coral)',
                  }}>
                    {piece.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {piece.current.clicks}
                  <span className="ml-2"><ChangeIndicator value={piece.clicksChange} /></span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {piece.current.impressions}
                  <span className="ml-2"><ChangeIndicator value={piece.impressionsChange} /></span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {piece.current.position}
                  <span className="ml-2"><ChangeIndicator value={piece.positionChange} invert /></span>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {(piece.current.ctr * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
