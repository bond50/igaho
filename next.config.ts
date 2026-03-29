import type { NextConfig } from 'next';

const isWindows = process.platform === 'win32';

const nextConfig: NextConfig = {
  // ✅ your custom field (if you use it elsewhere)
  allowedDevOrigins: ['192.168.253.106'],

  // ✅ only enable standalone when NOT on Windows
  ...(isWindows ? {} : { output: 'standalone' }),

  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  cacheComponents: true,
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
    ],
  },
};

export default nextConfig;
