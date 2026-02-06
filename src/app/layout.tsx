import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces, DM_Sans } from 'next/font/google';
import NavLinks from '@/components/NavLinks';
import MobileNav from '@/components/MobileNav';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fraunces',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

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
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
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
              <NavLinks />
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="container-app py-6 sm:py-8 pb-20 sm:pb-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-auto py-8 hidden sm:block" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="container-app">
            <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              AI-powered product research
            </p>
          </div>
        </footer>

        {/* Mobile Bottom Nav */}
        <MobileNav />
      </body>
    </html>
  );
}
