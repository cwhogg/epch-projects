'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive } from '@/lib/nav-utils';

const navItems = [
  { href: '/', label: 'Projects' },
  { href: '/ideas/new', label: 'Ideation' },
  { href: '/analytics', label: 'Analytics' },
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
