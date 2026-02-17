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
    ];
  },
};

export default nextConfig;
