/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Configure API routes timeout for long-running requests (o3 reasoning)
  // This applies to serverless function execution time
  experimental: {
    // Maximum execution time for API routes (in seconds)
    // Default is 10s for dev, 60s for Vercel Hobby, 300s for Pro
    // For o3, we need at least 5 minutes (300 seconds)
    proxyTimeout: 300000, // 5 minutes in milliseconds
  },

  // Enable WebSocket support
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },

  // Headers for security and permissions
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
