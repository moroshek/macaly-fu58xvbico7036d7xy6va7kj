"use client"; // Keep this

import { useEffect } from 'react'; // Import useEffect

// All other original imports related to CSS, fonts, Metadata, StableClientWrapper remain removed for this test.

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
      {/* className and suppressHydrationWarning are temporarily removed */}
      <body>
        {/* StableClientWrapper is temporarily removed */}
        {children}
      </body>
    </html>
  );
}
