import { getBadgeClass, getConfidenceStyle, getWebsiteStatusStyle, getWebsiteStatusLabel } from '../analysis-styles';

describe('getBadgeClass', () => {
  it('returns badge-success for Tier 1', () => {
    expect(getBadgeClass('Tier 1')).toBe('badge-success');
  });
  it('returns badge-warning for Tier 2', () => {
    expect(getBadgeClass('Tier 2')).toBe('badge-warning');
  });
  it('returns badge-danger for Tier 3', () => {
    expect(getBadgeClass('Tier 3')).toBe('badge-danger');
  });
  it('returns badge-neutral for unknown', () => {
    expect(getBadgeClass('Unknown')).toBe('badge-neutral');
  });
});

describe('getConfidenceStyle', () => {
  it('returns emerald for High', () => {
    expect(getConfidenceStyle('High')).toEqual({ color: 'var(--accent-emerald)' });
  });
  it('returns amber for Medium', () => {
    expect(getConfidenceStyle('Medium')).toEqual({ color: 'var(--accent-amber)' });
  });
  it('returns danger for Low', () => {
    expect(getConfidenceStyle('Low')).toEqual({ color: 'var(--color-danger)' });
  });
  it('returns muted for unknown', () => {
    expect(getConfidenceStyle('Other')).toEqual({ color: 'var(--text-muted)' });
  });
});

describe('getWebsiteStatusStyle', () => {
  it('returns emerald for live', () => {
    const style = getWebsiteStatusStyle('live');
    expect(style.background).toContain('16, 185, 129');
    expect(style.color).toBe('var(--accent-emerald)');
  });
  it('returns amber for deploying', () => {
    const style = getWebsiteStatusStyle('deploying');
    expect(style.background).toContain('245, 158, 11');
    expect(style.color).toBe('var(--accent-amber)');
  });
  it('returns amber for pushing', () => {
    const style = getWebsiteStatusStyle('pushing');
    expect(style.color).toBe('var(--accent-amber)');
  });
  it('returns amber for generating', () => {
    const style = getWebsiteStatusStyle('generating');
    expect(style.color).toBe('var(--accent-amber)');
  });
  it('returns danger for failed', () => {
    const style = getWebsiteStatusStyle('failed');
    expect(style.background).toContain('248, 113, 113');
    expect(style.color).toBe('var(--color-danger)');
  });
  it('returns muted for unknown status', () => {
    const style = getWebsiteStatusStyle('idle');
    expect(style.color).toBe('var(--text-muted)');
  });
});

describe('getWebsiteStatusLabel', () => {
  it('capitalizes first letter', () => {
    expect(getWebsiteStatusLabel('live')).toBe('Live');
    expect(getWebsiteStatusLabel('deploying')).toBe('Deploying');
    expect(getWebsiteStatusLabel('failed')).toBe('Failed');
  });
});
