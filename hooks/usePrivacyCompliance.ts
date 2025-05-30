"use client";

import { useState, useCallback } from 'react';

const usePrivacyCompliance = () => {
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [dataRetentionNotified, setDataRetentionNotified] = useState(false);

  const requestPrivacyConsent = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      // Show privacy consent modal
      const consent = window.confirm(`
        Medical Interview Privacy Notice:
        
        • This conversation will be recorded and processed by AI
        • Your audio and transcript will be used only for this medical intake
        • Data will be processed securely and deleted after processing
        • You can stop the interview at any time
        
        Do you consent to proceeding with the AI medical interview?
      `);
      
      setPrivacyAccepted(consent);
      setDataRetentionNotified(true);
      resolve(consent);
    });
  }, []);

  return {
    privacyAccepted,
    dataRetentionNotified,
    requestPrivacyConsent
  };
};

export default usePrivacyCompliance;