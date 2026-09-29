/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com',
      },
      {
        protocol: 'https',
        hostname: '**.fbcdn.net',
      },
    ],
  },
  rewrites: async () => {
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/api/process',
            destination: 'http://127.0.0.1:5328/api/process',
          },
          {
            source: '/api/process/:path*',
            destination: 'http://127.0.0.1:5328/api/process/:path*',
          },
        ]
      : [];
  },
};

export default nextConfig;
