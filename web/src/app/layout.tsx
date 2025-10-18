import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'TextToSpeech Web Studio',
  description: 'Browser-based text-to-speech studio with multi-provider support.',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
