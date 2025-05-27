"use client";

import { useState, useEffect, useCallback } from 'react';

const useAccessibilityFeatures = () => {
  const [fontSize, setFontSize] = useState('normal');
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Detect user preferences
  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(prefersReducedMotion.matches);

    // Check for high contrast preference
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
    setHighContrast(prefersHighContrast.matches);

    // Listen for changes
    const handleReducedMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    const handleHighContrastChange = (e: MediaQueryListEvent) => setHighContrast(e.matches);

    prefersReducedMotion.addEventListener('change', handleReducedMotionChange);
    prefersHighContrast.addEventListener('change', handleHighContrastChange);

    return () => {
      prefersReducedMotion.removeEventListener('change', handleReducedMotionChange);
      prefersHighContrast.removeEventListener('change', handleHighContrastChange);
    };
  }, []);

  const announceToScreenReader = useCallback((message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.position = 'absolute';
    announcement.style.left = '-10000px';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    announcement.textContent = message;

    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, []);

  return {
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    reducedMotion,
    announceToScreenReader
  };
};

export default useAccessibilityFeatures;