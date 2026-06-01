import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BBTI ERP - Sistema de Gestión',
  description: 'Sistema ERP para BBTI S.A.C. - Fabricación de Tableros Eléctricos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
