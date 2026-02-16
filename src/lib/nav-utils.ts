export function isActive(pathname: string, href: string): boolean {
  switch (href) {
    case '/':
      // Projects tab: home + all project sub-pages
      return pathname === '/' || pathname.startsWith('/analyses/');
    case '/ideas/new':
      // Ideation tab: idea creation + analysis trigger
      return pathname.startsWith('/ideas/');
    case '/analytics':
      // Analytics tab: cross-site analytics + testing dashboard
      // But NOT per-project analytics (/analyses/[id]/analytics)
      return pathname === '/analytics' || pathname === '/testing';
    default:
      return false;
  }
}
