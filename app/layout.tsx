import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

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
      <body className={poppins.variable}>
        {children}
      </body>
    </html>
  );
}
