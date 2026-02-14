import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AlertProvider } from '@/components/AlertContext';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UCC Event App",
  description: "Secure event management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AlertProvider>
          {children}
        </AlertProvider>
      </body>
    </html>
  );
}
