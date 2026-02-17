import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@googleapis/searchconsole'],
  experimental: {
    optimizePackageImports: ['recharts', 'react-markdown'],
  },
  async redirects() {
    return [
      {
        source: '/analyses/:id/foundation',
        destination: '/foundation/:id',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
