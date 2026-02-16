import { describe, it, expect } from 'vitest';
import { isActive } from '../nav-utils';

const NAV_ITEMS = ['/', '/ideas/new', '/analytics'];

function activeTabsFor(pathname: string): string[] {
  return NAV_ITEMS.filter((href) => isActive(pathname, href));
}

describe('isActive (project-centric nav)', () => {
  describe('/ (Projects) tab', () => {
    it('activates on /', () => {
      expect(isActive('/', '/')).toBe(true);
    });

    it('activates on /analyses/abc (project dashboard)', () => {
      expect(isActive('/analyses/abc', '/')).toBe(true);
    });

    it('activates on /analyses/abc/analysis', () => {
      expect(isActive('/analyses/abc/analysis', '/')).toBe(true);
    });

    it('activates on /analyses/abc/foundation', () => {
      expect(isActive('/analyses/abc/foundation', '/')).toBe(true);
    });

    it('activates on /analyses/abc/content', () => {
      expect(isActive('/analyses/abc/content', '/')).toBe(true);
    });

    it('activates on /analyses/abc/painted-door', () => {
      expect(isActive('/analyses/abc/painted-door', '/')).toBe(true);
    });

    it('activates on /analyses/abc/analytics', () => {
      expect(isActive('/analyses/abc/analytics', '/')).toBe(true);
    });

    it('does not activate on /ideas/new', () => {
      expect(isActive('/ideas/new', '/')).toBe(false);
    });

    it('does not activate on /analytics', () => {
      expect(isActive('/analytics', '/')).toBe(false);
    });
  });

  describe('/ideas/new (Ideation) tab', () => {
    it('activates on /ideas/new', () => {
      expect(isActive('/ideas/new', '/ideas/new')).toBe(true);
    });

    it('activates on /ideas/abc/analyze', () => {
      expect(isActive('/ideas/abc/analyze', '/ideas/new')).toBe(true);
    });

    it('does not activate on /', () => {
      expect(isActive('/', '/ideas/new')).toBe(false);
    });
  });

  describe('/analytics (Analytics) tab', () => {
    it('activates on /analytics', () => {
      expect(isActive('/analytics', '/analytics')).toBe(true);
    });

    it('activates on /testing', () => {
      expect(isActive('/testing', '/analytics')).toBe(true);
    });

    it('does not activate on /', () => {
      expect(isActive('/', '/analytics')).toBe(false);
    });

    it('does not activate on /analyses/abc/analytics (per-project analytics is Projects)', () => {
      expect(isActive('/analyses/abc/analytics', '/analytics')).toBe(false);
    });
  });

  describe('no path triggers multiple tabs', () => {
    const testPaths = [
      '/',
      '/analyses/abc',
      '/analyses/abc/analysis',
      '/analyses/abc/foundation',
      '/analyses/abc/content',
      '/analyses/abc/analytics',
      '/analyses/abc/painted-door',
      '/ideas/new',
      '/ideas/abc/analyze',
      '/analytics',
      '/testing',
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

  describe('orphaned pages (no tab active)', () => {
    const orphanedPaths = [
      '/analysis',
      '/foundation',
      '/website',
      '/content',
      '/optimization',
      '/ideation',
    ];

    it.each(orphanedPaths)('"%s" activates no tab', (pathname) => {
      const active = activeTabsFor(pathname);
      expect(active.length).toBe(0);
    });
  });
});
