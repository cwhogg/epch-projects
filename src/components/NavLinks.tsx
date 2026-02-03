'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/ideation', label: 'Ideation' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/content', label: 'Content' },
  { href: '/testing', label: 'Testing' },
  { href: '/optimization', label: 'Optimization' },
];

function isActive(pathname: string, href: string): boolean {
  switch (href) {
    case '/ideation':
      return pathname === '/ideation';
    case '/analysis':
      return pathname === '/analysis' || pathname.startsWith('/analyses/') && !pathname.includes('/content') && !pathname.includes('/analytics') || pathname.startsWith('/ideas/');
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

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="btn-ghost rounded-lg text-sm hidden sm:flex"
          style={isActive(pathname, item.href) ? { color: 'var(--accent-coral)' } : undefined}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
