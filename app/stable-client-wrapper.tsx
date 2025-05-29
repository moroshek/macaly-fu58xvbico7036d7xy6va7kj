"use client";

import { useRef, useEffect } from "react";

// Stability wrapper to prevent child component remounting
function StableWrapper({ children }: { children: React.ReactNode }) {
  const keyRef = useRef('stable-wrapper-key');
  const mountCountRef = useRef(0);

  useEffect(() => {
    mountCountRef.current += 1;
    console.log(`🔒 StableWrapper Mount #${mountCountRef.current} - Key: ${keyRef.current}`);

    return () => {
      console.log(`🔒 StableWrapper Unmount #${mountCountRef.current}`);
      console.trace('StableWrapper unmount trace - This should only happen on page navigation');
    };
  }, []);

  return (
    <div key={keyRef.current} style={{ width: '100%', height: '100%', minHeight: '100vh' }}>
      {children}
    </div>
  );
}

// Component mount tracker for debugging
function LayoutMountTracker({ children }: { children: React.ReactNode }) {
  const layoutMountCount = useRef(0);

  useEffect(() => {
    layoutMountCount.current += 1;
    console.log(`🏗️ LayoutMountTracker Mount #${layoutMountCount.current}`);

    if (typeof window !== 'undefined') {
      const errorStates = {
        urlError: window.location.href.includes('error'),
        localStorageError: !!localStorage.getItem('app-error'),
        sessionStorageError: !!sessionStorage.getItem('app-error'),
      };

      if (Object.values(errorStates).some(Boolean)) {
        console.warn('🚨 LayoutMountTracker mounted with error states:', errorStates);
      }
    }

    return () => {
      console.log(`🏗️ LayoutMountTracker Unmount #${layoutMountCount.current}`);
      console.trace('LayoutMountTracker unmount trace');
    };
  }, []);

  return <>{children}</>;
}

export default function StableClientWrapper({ children }: { children: React.ReactNode }) {
  const wrapperMountCount = useRef(0); // Added by user

  useEffect(() => { // Added by user
    wrapperMountCount.current += 1;
    console.log(`🌟 StableClientWrapper Mount #${wrapperMountCount.current}`);
    console.log("--- StableClientWrapper useEffect running on CLIENT ---");

    return () => {
      console.log(`🌟 StableClientWrapper Unmount #${wrapperMountCount.current}`);
      console.trace('StableClientWrapper unmount trace');
    };
  }, []);

  return (
    <LayoutMountTracker>
      <StableWrapper>
        {children}
      </StableWrapper>
    </LayoutMountTracker>
  );
}
