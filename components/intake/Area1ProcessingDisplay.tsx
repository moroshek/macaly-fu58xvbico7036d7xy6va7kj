"use client";

import React from 'react';
import FunLoadingAnimation from '@/components/FunLoadingAnimation';

const Area1ProcessingDisplay: React.FC = () => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
      <FunLoadingAnimation variant="transcript" />
    </div>
  );
};

export default Area1ProcessingDisplay;