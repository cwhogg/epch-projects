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
      {
        source: '/analyses/:id/painted-door',
        destination: '/website/:id',
        permanent: true,
      },
      {
        source: '/analyses/:id/content/generate',
        destination: '/content/:id/generate',
        permanent: true,
      },
      {
        source: '/analyses/:id/content/:pieceId',
        destination: '/content/:id/:pieceId',
        permanent: true,
      },
      {
        source: '/analyses/:id/content',
        destination: '/content/:id',
        permanent: true,
      },
      // Route rename: /analyses/[id] → /project/[id]
      {
        source: '/analyses/:id/analysis',
        destination: '/project/:id/analysis',
        permanent: true,
      },
      {
        source: '/analyses/:id/analytics',
        destination: '/project/:id/analytics',
        permanent: true,
      },
      {
        source: '/analyses/:id',
        destination: '/project/:id',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
