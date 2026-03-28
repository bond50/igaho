import type { Metadata } from 'next';
import { Geist, Roboto } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const roboto = Roboto({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Igaho Association',
  description: 'Authentication portal for Igaho Association members.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${roboto.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <TooltipProvider delayDuration={120}>
          {children}
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
