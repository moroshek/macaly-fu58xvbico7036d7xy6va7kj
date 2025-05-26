"use client";

import { useState, useCallback, useEffect } from 'react';

const useMicrophonePermission = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      setPermissionError(null);
      // Stop the stream immediately as we just needed to test permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission error:', error);
      setHasPermission(false);
      
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            setPermissionError('Microphone access denied. Please allow microphone access and refresh the page.');
            break;
          case 'NotFoundError':
            setPermissionError('No microphone found. Please connect a microphone and try again.');
            break;
          case 'NotReadableError':
            setPermissionError('Microphone is already in use by another application.');
            break;
          default:
            setPermissionError(`Microphone error: ${error.message}`);
        }
      } else {
        setPermissionError('Unknown microphone error occurred.');
      }
      return false;
    }
  }, []);

  useEffect(() => {
    // Check permission on component mount
    requestPermission();
  }, [requestPermission]);

  return { hasPermission, permissionError, requestPermission };
};

export default useMicrophonePermission;