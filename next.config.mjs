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
  outputFileTracingIncludes: {
    '/api/media/process': ['./node_modules/ffmpeg-static/**/*'],
  },
  rewrites: async () => {
    // In local development, forward calls to api/raw to local python server if running
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/raw',
          destination: 'http://127.0.0.1:8000/api/raw',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
