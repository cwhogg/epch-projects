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

    it('activates on /project/abc (project dashboard)', () => {
      expect(isActive('/project/abc', '/')).toBe(true);
    });

    it('activates on /project/abc/analysis', () => {
      expect(isActive('/project/abc/analysis', '/')).toBe(true);
    });

    it('activates on /foundation/abc (foundation detail)', () => {
      expect(isActive('/foundation/abc', '/')).toBe(true);
    });

    it('activates on /content/abc (content detail)', () => {
      expect(isActive('/content/abc', '/')).toBe(true);
    });

    it('activates on /website/abc (website detail)', () => {
      expect(isActive('/website/abc', '/')).toBe(true);
    });

    it('activates on /project/abc/analytics', () => {
      expect(isActive('/project/abc/analytics', '/')).toBe(true);
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

    it('does not activate on /project/abc/analytics (per-project analytics is Projects)', () => {
      expect(isActive('/project/abc/analytics', '/analytics')).toBe(false);
    });
  });

  describe('no path triggers multiple tabs', () => {
    const testPaths = [
      '/',
      '/project/abc',
      '/project/abc/analysis',
      '/foundation/abc',
      '/content/abc',
      '/project/abc/analytics',
      '/website/abc',
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
