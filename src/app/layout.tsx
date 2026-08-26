import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Sans } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/presentation/providers/AppProviders';

// Archivo carries the money: sturdy, tabular, a little industrial, like a price gun.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  weight: ['500', '600', '700'],
  display: 'swap',
});

// Instrument Sans handles the chrome, so labels never compete with figures.
const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Badawi Shop',
  description: 'Till and stock for Badawi Shop',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Badawi Shop' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#14110f',
  width: 'device-width',
  initialScale: 1,
  // The till has fixed bars top and bottom; letting the page zoom just hides them.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${instrument.variable}`}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
