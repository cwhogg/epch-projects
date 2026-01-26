import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'EPCH Project Research',
  description: 'Product idea research and analysis dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* Navigation */}
        <nav className="sticky top-0 z-50 backdrop-blur-xl nav-blur">
          <div className="container-app">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%)' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    {/* E - top left */}
                    <path d="M4 4h5v1.5h-3.5v2.5h3v1.5h-3v2.5h3.5v1.5h-5v-9.5z" fill="white"/>
                    {/* P - top right */}
                    <path d="M13 4h3.5c1.4 0 2.5.8 2.5 2.25s-1.1 2.25-2.5 2.25h-2v5h-1.5v-9.5zm1.5 3h1.8c.7 0 1.2-.35 1.2-.75s-.5-.75-1.2-.75h-1.8v1.5z" fill="white"/>
                    {/* C - bottom left */}
                    <path d="M4 14.5c0-2.5 1.8-4 4-4 1.5 0 2.7.7 3.2 1.8l-1.4.7c-.3-.6-.9-1-1.8-1-1.3 0-2.3.9-2.3 2.5s1 2.5 2.3 2.5c.9 0 1.5-.4 1.8-1l1.4.7c-.5 1.1-1.7 1.8-3.2 1.8-2.2 0-4-1.5-4-4z" fill="white"/>
                    {/* H - bottom right */}
                    <path d="M13 10.5h1.5v3.5h3v-3.5h1.5v9h-1.5v-4h-3v4h-1.5v-9z" fill="white"/>
                  </svg>
                </div>
                <span className="font-display text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                  <span className="hidden sm:inline">EPCH Project Research</span>
                  <span className="sm:hidden">EPCH</span>
                </span>
              </Link>

              {/* Nav Links */}
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="btn-ghost rounded-lg text-sm hidden sm:flex"
                >
                  Dashboard
                </Link>
                <Link
                  href="/ideas/new"
                  className="btn btn-primary text-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  <span className="hidden sm:inline">New Idea</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="container-app py-6 sm:py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-auto py-8" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="container-app">
            <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              AI-powered product research
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
