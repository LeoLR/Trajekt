import type { ReactNode } from 'react';
import './globals.css';
import { requestLang } from './context';

export const metadata = {
  title: 'Trajekt',
  description: 'The flight recorder for AI agents.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await requestLang();
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
