'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive } from '@/lib/nav-utils';

const navItems = [
  { href: '/ideation', label: 'Ideation' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/foundation', label: 'Foundation' },
  { href: '/website', label: 'Website' },
  { href: '/content', label: 'Content' },
  { href: '/testing', label: 'Testing' },
  { href: '/optimization', label: 'Optimization' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0.5">
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
