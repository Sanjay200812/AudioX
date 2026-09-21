import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AudioXProvider } from '@/context/AudioXContext';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ToastContainer } from '@/components/ToastContainer';
import { OfflineBanner } from '@/components/OfflineBanner';

export const metadata: Metadata = {
  title: 'AudioX | Your Audio. Offline.',
  description: 'Private personal media-processing tool for converting and queueing permitted audio for offline listening.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#070707',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-[#070707] text-white min-h-screen flex flex-col antialiased selection:bg-indigo-500/30 selection:text-white pb-20 md:pb-6" suppressHydrationWarning>
        <AudioXProvider>
          <OfflineBanner />
          <Navbar />
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {children}
          </main>
          <MobileBottomNav />
          <ToastContainer />
        </AudioXProvider>
      </body>
    </html>
  );
}
