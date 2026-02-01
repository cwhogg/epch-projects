'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks() {
  const pathname = usePathname();
  const isAnalytics = pathname === '/analytics';

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/"
        className="btn-ghost rounded-lg text-sm hidden sm:flex"
      >
        Dashboard
      </Link>
      <Link
        href="/analytics"
        className="btn-ghost rounded-lg text-sm hidden sm:flex"
      >
        Analytics
      </Link>
      <Link
        href="/ideas/new"
        className={`btn text-sm ${isAnalytics ? 'btn-secondary' : 'btn-primary'}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span className="hidden sm:inline">New Idea</span>
      </Link>
    </div>
  );
}
