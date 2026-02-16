import { describe, it, expect } from 'vitest';
import { isActive } from '../nav-utils';

const NAV_ITEMS = ['/ideation', '/analysis', '/foundation', '/website', '/content', '/testing', '/optimization'];

function activeTabsFor(pathname: string): string[] {
  return NAV_ITEMS.filter((href) => isActive(pathname, href));
}

describe('isActive', () => {
  describe('/foundation tab', () => {
    it('activates on /foundation', () => {
      expect(isActive('/foundation', '/foundation')).toBe(true);
    });

    it('activates on /analyses/abc/foundation', () => {
      expect(isActive('/analyses/abc/foundation', '/foundation')).toBe(true);
    });

    it('does not activate on /analysis', () => {
      expect(isActive('/analysis', '/foundation')).toBe(false);
    });

    it('does not activate on /analyses/abc', () => {
      expect(isActive('/analyses/abc', '/foundation')).toBe(false);
    });

    it('does not activate on /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/foundation')).toBe(false);
    });
  });

  describe('/analysis tab', () => {
    it('activates on /analysis', () => {
      expect(isActive('/analysis', '/analysis')).toBe(true);
    });

    it('activates on /analyses/abc', () => {
      expect(isActive('/analyses/abc', '/analysis')).toBe(true);
    });

    it('activates on /ideas/new', () => {
      expect(isActive('/ideas/new', '/analysis')).toBe(true);
    });

    it('does not activate on /analyses/abc/foundation', () => {
      expect(isActive('/analyses/abc/foundation', '/analysis')).toBe(false);
    });

    it('does not activate on /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/analysis')).toBe(false);
    });

    it('does not activate on /analyses/abc/analytics', () => {
      expect(isActive('/analyses/abc/analytics', '/analysis')).toBe(false);
    });

    it('does not activate on /analyses/abc/painted-door', () => {
      expect(isActive('/analyses/abc/painted-door', '/analysis')).toBe(false);
    });
  });

  describe('no path triggers multiple tabs', () => {
    const testPaths = [
      '/foundation',
      '/analysis',
      '/analyses/abc',
      '/analyses/abc/foundation',
      '/analyses/abc/content',
      '/analyses/abc/analytics',
      '/analyses/abc/painted-door',
      '/ideation',
      '/website',
      '/content',
      '/testing',
      '/optimization',
      '/ideas/new',
    ];

    it.each(testPaths)('"%s" activates at most one tab', (pathname) => {
      const active = activeTabsFor(pathname);
      expect(active.length).toBeLessThanOrEqual(1);
    });

    it.each(testPaths)('"%s" activates at least one tab', (pathname) => {
      const active = activeTabsFor(pathname);
      expect(active.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('other tabs', () => {
    it('/website activates on /website', () => {
      expect(isActive('/website', '/website')).toBe(true);
    });

    it('/content activates on /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/content')).toBe(true);
    });

    it('/testing activates on /analyses/abc/analytics', () => {
      expect(isActive('/analyses/abc/analytics', '/testing')).toBe(true);
    });

    it('unknown href returns false', () => {
      expect(isActive('/anything', '/unknown')).toBe(false);
    });
  });
});
