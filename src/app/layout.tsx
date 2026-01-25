import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Research Dashboard',
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
        <nav className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(13, 13, 15, 0.8)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="container-app">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ff6b5b 0%, #ff8f6b 100%)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20V10" />
                    <path d="M18 20V4" />
                    <path d="M6 20v-4" />
                  </svg>
                </div>
                <span className="font-display text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                  Research
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
