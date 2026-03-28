import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TUA  Ay Yüzeyi Otonom Rota Optimizasyonu',
  description: 'React Three Fiber ile geliştirilmiş 3D Ay yüzeyi simülasyonu. Özel A* algoritması ile otonom rover rota optimizasyonu.',
  keywords: ['TUA', 'Ay', 'rover', 'rota optimizasyonu', 'A*', 'simülasyon', '3D'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
