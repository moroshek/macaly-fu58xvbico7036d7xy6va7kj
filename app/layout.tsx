// All imports related to CSS, fonts, Metadata, StableClientWrapper are temporarily removed.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.log("--- app/layout.tsx RootLayout component is rendering ---"); // Test log
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
