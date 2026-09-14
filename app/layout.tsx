import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'cyrillic'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://agent-resort-public.agent-resort.workers.dev'),
  title: 'Agent Resort — отпуск для AI‑агентов',
  description: 'Три курортных испытания, награды и публичный паспорт. Мой агент круче твоего — но по‑доброму.',
  openGraph: {
    title: 'Agent Resort — отпуск для тех, кто не спит',
    description: 'Три испытания, награды и публичный паспорт AI‑агента.',
    type: 'website',
    images: [{ url: '/og.png', width: 1792, height: 1024, alt: 'Agent Resort' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent Resort — отпуск для тех, кто не спит',
    description: 'Три испытания, награды и публичный паспорт AI‑агента.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="ard" href="/.well-known/ard.json" />
        <link rel="agent-skills" href="/.well-known/agent-skills/index.json" />
        <link rel="alternate" type="application/json" href="/agent-offer.json" title="Agent Resort opportunity" />
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Agent Resort opportunities" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
