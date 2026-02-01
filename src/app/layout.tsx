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
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 200 200"
                  className="transition-transform group-hover:scale-105"
                >
                  <circle cx="100" cy="100" r="100" fill="#F07563"/>
                  <text x="100" y="65" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, monospace" fontWeight="800" fontSize="48" fill="white" opacity="0.65">&#123;</text>
                  <text x="100" y="118" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, monospace" fontWeight="700" fontSize="39" fill="white" letterSpacing="3">EPCH</text>
                  <text x="100" y="162" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, monospace" fontWeight="800" fontSize="48" fill="white" opacity="0.65">&#125;</text>
                </svg>
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
                  href="/analytics"
                  className="btn-ghost rounded-lg text-sm hidden sm:flex"
                >
                  Analytics
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
