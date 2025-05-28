import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import StableClientWrapper from "./stable-client-wrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MedIntake - AI-Powered Medical Intake Assistant",
  description: "Expedite your medical intake process with our secure, HIPAA-compliant AI assistant.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning={true}>
        <StableClientWrapper>
          {children}
        </StableClientWrapper>
      </body>
    </html>
  );
}
