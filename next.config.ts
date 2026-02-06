import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@googleapis/searchconsole'],
  experimental: {
    optimizePackageImports: ['recharts', 'react-markdown'],
  },
};

export default nextConfig;
