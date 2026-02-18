'use client';

import { useState, useEffect, useCallback } from 'react';
import { GSCAnalyticsData } from '@/types';
import { GSCProperty } from '@/components/PropertySelectorWithHelper';

interface AnalysisInfo {
  ideaName: string;
  seoData: {
    synthesis: {
      topKeywords: {
        keyword: string;
        intentType: string;
        estimatedVolume: string;
        estimatedCompetitiveness: string;
      }[];
    };
  } | null;
}

export function useGSCData(ideaId: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisInfo | null>(null);
  const [linkedSiteUrl, setLinkedSiteUrl] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<GSCAnalyticsData | null>(null);
  const [properties, setProperties] = useState<GSCProperty[]>([]);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gscConfigured, setGscConfigured] = useState(true);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // Fetch analysis info
        const analysisRes = await fetch(`/api/project/${ideaId}`);
        if (analysisRes.ok) {
          const data = await analysisRes.json();
          const analysis = data.analysis || data;
          const content = data.content;
          let seoData = null;
          if (content?.seoData) {
            try {
              seoData = JSON.parse(content.seoData);
            } catch (error) { console.debug('[analytics-page] SEO data parse failed:', error); }
          }
          setAnalysisInfo({ ideaName: analysis.ideaName, seoData });
        }

        // Check for existing GSC link
        const linkRes = await fetch(`/api/gsc/${ideaId}`);
        if (linkRes.ok) {
          const { analytics: analyticsData } = await linkRes.json();
          setAnalytics(analyticsData);
          setLinkedSiteUrl(analyticsData.siteUrl);
        } else if (linkRes.status === 404) {
          // No link — need to show property selector
          const propsRes = await fetch('/api/gsc/properties');
          if (propsRes.ok) {
            const { properties: props } = await propsRes.json();
            setProperties(props);
            if (props.length > 0) setSelectedProperty(props[0].siteUrl);
          } else if (propsRes.status === 503) {
            setGscConfigured(false);
          }
        } else if (linkRes.status === 503) {
          setGscConfigured(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [ideaId]);

  const handleLink = async () => {
    if (!selectedProperty) return;
    setLinking(true);
    try {
      const linkRes = await fetch(`/api/gsc/${ideaId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: selectedProperty }),
      });
      if (!linkRes.ok) throw new Error('Failed to link property');

      setLinkedSiteUrl(selectedProperty);

      // Fetch analytics
      const analyticsRes = await fetch(`/api/gsc/${ideaId}`);
      if (analyticsRes.ok) {
        const { analytics: data } = await analyticsRes.json();
        setAnalytics(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    try {
      await fetch(`/api/gsc/${ideaId}/link`, { method: 'DELETE' });
      setLinkedSiteUrl(null);
      setAnalytics(null);
      // Reload properties
      const propsRes = await fetch('/api/gsc/properties');
      if (propsRes.ok) {
        const { properties: props } = await propsRes.json();
        setProperties(props);
        if (props.length > 0) setSelectedProperty(props[0].siteUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink');
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/gsc/${ideaId}`, { method: 'POST' });
      if (res.ok) {
        const { analytics: data } = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [ideaId]);

  const handlePropertyRefresh = async () => {
    const res = await fetch('/api/gsc/properties?refresh=true');
    if (res.ok) {
      const { properties: props } = await res.json();
      setProperties(props);
      if (props.length > 0 && !props.find((p: GSCProperty) => p.siteUrl === selectedProperty)) {
        setSelectedProperty(props[0].siteUrl);
      }
    }
  };

  return {
    loading,
    error,
    analysisInfo,
    linkedSiteUrl,
    analytics,
    properties,
    selectedProperty,
    setSelectedProperty,
    linking,
    refreshing,
    gscConfigured,
    handleLink,
    handleUnlink,
    handleRefresh,
    handlePropertyRefresh,
  };
}

export type { AnalysisInfo };
