import "./globals.css"; // Ensures CSS is applied
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import StableClientWrapper from "./stable-client-wrapper";

const inter = Inter({ subsets: ["latin"] }); // Font initialization

export const metadata: Metadata = { // Original metadata
  title: "MedIntake - AI-Powered Medical Intake Assistant",
  description: "Expedite your medical intake process with our secure, HIPAA-compliant AI assistant.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Direct console.log removed from here

  useEffect(() => {
    console.log("--- app/layout.tsx RootLayout useEffect running on CLIENT ---"); // Test log inside useEffect
  }, []); // Empty dependency array ensures it runs once on mount

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
