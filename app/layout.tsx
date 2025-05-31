import "./globals.css"; // Ensures CSS is applied
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import StableClientWrapper from "./stable-client-wrapper";

const inter = Inter({ subsets: ["latin"] }); // Font initialization

export const metadata: Metadata = { // Original metadata
  title: "Med Intake - AI-Powered Medical Intake Assistant",
  description: "Expedite your medical intake process with our secure, HIPAA-compliant AI assistant.",
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  themeColor: '#14b8a6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // REMOVED: Direct console.log and useEffect from server component
  // Server components cannot use client-side hooks like useEffect

  return (
    <html lang="en">
      {/* Ensures font class and hydration warning are on the body tag */}
      <body className={inter.className} suppressHydrationWarning={true}> 
        <StableClientWrapper>
          {children}
        </StableClientWrapper>
      </body>
    </html>
  );
}
