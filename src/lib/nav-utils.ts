export function isActive(pathname: string, href: string): boolean {
  switch (href) {
    case '/ideation':
      return pathname === '/ideation';
    case '/analysis':
      return (pathname === '/analysis') ||
        (pathname.startsWith('/analyses/') &&
          !pathname.includes('/content') &&
          !pathname.includes('/analytics') &&
          !pathname.includes('/painted-door') &&
          !pathname.includes('/foundation')) ||
        pathname.startsWith('/ideas/');
    case '/foundation':
      return pathname === '/foundation' ||
        (pathname.startsWith('/analyses/') && pathname.endsWith('/foundation'));
    case '/website':
      return pathname === '/website' || pathname.includes('/painted-door');
    case '/content':
      return pathname === '/content' || pathname.includes('/content');
    case '/testing':
      return pathname === '/testing' || pathname.includes('/analytics');
    case '/optimization':
      return pathname === '/optimization';
    default:
      return false;
  }
}
