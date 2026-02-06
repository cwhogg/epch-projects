import { describe, it, expect } from 'vitest';
import { detectVertical } from '../seo-knowledge';

describe('detectVertical', () => {
  it('detects b2b-saas from business keywords', () => {
    const idea = { name: 'SaaS Analytics Dashboard', description: 'B2B automation tool for enterprise teams', id: '1', status: 'pending' as const, createdAt: '' };
    expect(detectVertical(idea as any)).toBe('b2b-saas');
  });

  it('detects healthcare-consumer from health keywords', () => {
    const idea = { name: 'Sleep Tracker', description: 'Mental health and wellness tracking for patients', id: '1', status: 'pending' as const, createdAt: '' };
    expect(detectVertical(idea as any)).toBe('healthcare-consumer');
  });

  it('defaults to general-niche', () => {
    const idea = { name: 'Recipe Sharing App', description: 'Share recipes with friends', id: '1', status: 'pending' as const, createdAt: '' };
    expect(detectVertical(idea as any)).toBe('general-niche');
  });
});
