/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    // In local development, forward calls to api/media/process to local python server if running
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/media/process',
          destination: 'http://127.0.0.1:8000/api/media/process',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
