"use client"; // Make it a client component to be safe

import { useEffect } from 'react'; // Import useEffect
import Link from 'next/link';

export default function NotFound() {
  useEffect(() => {
    // This useEffect doesn't need to do anything,
    // but its presence (with the import) ensures `useEffect` is defined
    // if the build process somehow expects it for a not-found page.
    // It also helps confirm client-side execution for this component.
    console.log("--- app/not-found.tsx useEffect running on CLIENT ---");
  }, []);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>
      <h1>404 - Page Not Found</h1>
      <p>Sorry, the page you are looking for does not exist.</p>
      <Link href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
        Go back home
      </Link>
    </div>
  );
}
