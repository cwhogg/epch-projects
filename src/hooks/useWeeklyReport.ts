'use client';

import { useState, useEffect, useCallback } from 'react';
import { WeeklyReport } from '@/types';

export function useWeeklyReport(ideaId: string) {
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [reportLoading, setReportLoading] = useState(true);
  const [runningReport, setRunningReport] = useState(false);

  const fetchWeeklyReport = useCallback(async (week?: string) => {
    setReportLoading(true);
    try {
      const url = week
        ? `/api/analytics/report?week=${encodeURIComponent(week)}`
        : '/api/analytics/report';
      const res = await fetch(url);
      if (res.status === 404) {
        const data = await res.json();
        setWeeklyReport(null);
        setAvailableWeeks(data.availableWeeks || []);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setWeeklyReport(data.report);
      setAvailableWeeks(data.availableWeeks || []);
      if (!week) setSelectedWeek(data.report.weekId);
    } catch (error) {
      console.debug('[analytics-page] report fetch failed:', error);
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeeklyReport();
  }, [fetchWeeklyReport]);

  async function handleRunReport() {
    setRunningReport(true);
    try {
      const res = await fetch('/api/cron/analytics', { method: 'POST' });
      if (res.ok) await fetchWeeklyReport();
    } catch (error) {
      console.debug('[analytics-page] run report failed:', error);
    } finally {
      setRunningReport(false);
    }
  }

  function handleWeekChange(week: string) {
    setSelectedWeek(week);
    fetchWeeklyReport(week);
  }

  // Filter weekly report pieces to this idea
  const ideaPieces = weeklyReport?.pieces.filter((p) => p.ideaId === ideaId) ?? [];
  const ideaAlerts = weeklyReport?.alerts.filter((a) => {
    const ideaSlugs = new Set(ideaPieces.map((p) => p.slug));
    return ideaSlugs.has(a.pieceSlug);
  }) ?? [];

  // Compute per-idea summary from weekly report
  const ideaSummary = ideaPieces.length > 0
    ? {
        totalClicks: ideaPieces.reduce((sum, p) => sum + p.current.clicks, 0),
        totalImpressions: ideaPieces.reduce((sum, p) => sum + p.current.impressions, 0),
        averagePosition: Math.round((ideaPieces.reduce((sum, p) => sum + p.current.position, 0) / ideaPieces.length) * 10) / 10,
        averageCtr: ideaPieces.reduce((sum, p) => sum + p.current.impressions, 0) > 0
          ? Math.round((ideaPieces.reduce((sum, p) => sum + p.current.clicks, 0) / ideaPieces.reduce((sum, p) => sum + p.current.impressions, 0)) * 10000) / 10000
          : 0,
        clicksChange: ideaPieces.some((p) => p.clicksChange !== null)
          ? ideaPieces.reduce((sum, p) => sum + (p.clicksChange ?? 0), 0)
          : null as number | null,
        impressionsChange: ideaPieces.some((p) => p.impressionsChange !== null)
          ? ideaPieces.reduce((sum, p) => sum + (p.impressionsChange ?? 0), 0)
          : null as number | null,
      }
    : null;

  return {
    weeklyReport,
    availableWeeks,
    selectedWeek,
    reportLoading,
    runningReport,
    ideaPieces,
    ideaAlerts,
    ideaSummary,
    handleRunReport,
    handleWeekChange,
  };
}
