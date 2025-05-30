"use client";

import { useState, useEffect } from 'react';

const useConnectionQuality = (uvSession: any) => {
  const [connectionQuality, setConnectionQuality] = useState<{
    latency: number | null;
    status: 'excellent' | 'good' | 'poor' | 'unknown';
    lastChecked: number;
  }>({
    latency: null,
    status: 'unknown',
    lastChecked: Date.now()
  });

  // Ping-based latency monitoring
  useEffect(() => {
    if (!uvSession || uvSession.status === 'disconnected') return;

    const checkLatency = async () => {
      try {
        const startTime = Date.now();
        
        // Simple ping test using a timestamp API
        await fetch('https://worldtimeapi.org/api/ip', { method: 'HEAD' });
        const latency = Date.now() - startTime;
        
        let status: 'excellent' | 'good' | 'poor' = 'excellent';
        if (latency > 300) status = 'poor';
        else if (latency > 150) status = 'good';
        
        setConnectionQuality({
          latency,
          status,
          lastChecked: Date.now()
        });
      } catch (error) {
        console.error('[Connection Quality] Ping failed:', error);
        setConnectionQuality(prev => ({
          ...prev,
          status: 'poor',
          lastChecked: Date.now()
        }));
      }
    };

    // Check every 10 seconds
    const interval = setInterval(checkLatency, 10000);
    
    // Initial check
    checkLatency();

    return () => clearInterval(interval);
  }, [uvSession]);

  return connectionQuality;
};

export default useConnectionQuality;