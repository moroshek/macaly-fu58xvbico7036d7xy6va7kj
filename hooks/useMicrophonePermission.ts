"use client";

import { useState, useCallback, useEffect } from 'react';

const useMicrophonePermission = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const requestPermission = useCallback(async () => {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName }); // Added 'as PermissionName' for TS
        console.log('[Debug] Initial microphone permission status:', permissionStatus.state);
        permissionStatus.onchange = () => {
          console.log('[Debug] Microphone permission status changed to:', permissionStatus.state);
          // Optionally, update component state based on this change
          setHasPermission(permissionStatus.state === 'granted');
          if (permissionStatus.state === 'denied') {
            setPermissionError('Microphone access was denied after initial check. Please allow microphone access and refresh.');
          }
        };
      } catch (e) {
        console.error('[Debug] Error querying microphone permission:', e);
      }
    } else {
      console.log('[Debug] navigator.permissions.query API not available.');
    }

    try {
      console.log('[Debug] Attempting to request microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      setPermissionError(null);
      // Stop the stream immediately as we just needed to test permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('[Debug] getUserMedia error object:', error);
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