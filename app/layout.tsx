import "./globals.css"; // Ensures CSS is applied
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import StableClientWrapper from "./stable-client-wrapper";

const inter = Inter({ subsets: ["latin"] }); // Font initialization

export const metadata: Metadata = { // Original metadata
  title: "Med Intake - AI-Powered Medical Intake Assistant",
  description: "Expedite your medical intake process with our secure, HIPAA-compliant AI assistant.",
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
