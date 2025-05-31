"use client";

import React, { useState, useEffect } from 'react';
import { Heart, Stethoscope, Activity, Brain, FileText, Users, Sparkles, Clock } from "lucide-react";

interface FunLoadingAnimationProps {
  loadingTexts?: string[];
  interval?: number;
  variant?: 'transcript' | 'summary' | 'analysis';
}

const transcriptLoadingTexts = [
  { text: "Listening with care 💙", icon: Heart },
  { text: "Every word matters 🎧", icon: Stethoscope },
  { text: "Capturing your story 📖", icon: FileText },
  { text: "Understanding your concerns 🤝", icon: Users },
  { text: "Recording important details ✨", icon: Sparkles },
  { text: "Your voice is being heard 🌟", icon: Activity },
  { text: "Creating your health narrative 📝", icon: Brain },
  { text: "Almost ready... 🏁", icon: Clock }
];

const summaryLoadingTexts = [
  { text: "Organizing your health story 📚", icon: FileText },
  { text: "Highlighting what matters most ⭐", icon: Sparkles },
  { text: "Creating your medical timeline 🕒", icon: Clock },
  { text: "Structuring symptoms thoughtfully 🩹", icon: Heart },
  { text: "Building your health profile 👤", icon: Users },
  { text: "Crafting clear documentation 📋", icon: Stethoscope },
  { text: "Preparing for your provider 🤝", icon: Activity },
  { text: "Finalizing your summary... ✨", icon: Brain }
];

const analysisLoadingTexts = [
  { text: "Thoughtfully reviewing details 🔍", icon: Brain },
  { text: "Connecting the dots 🔗", icon: Activity },
  { text: "Organizing for clarity 📊", icon: FileText },
  { text: "Highlighting key patterns 🌟", icon: Sparkles },
  { text: "Creating provider insights 💡", icon: Stethoscope },
  { text: "Structuring clinical notes 📝", icon: Heart },
  { text: "Preparing comprehensive view 🎯", icon: Users },
  { text: "Polishing final report... ✨", icon: Clock }
];

const defaultLoadingTexts = [
  { text: "Working our magic ✨", icon: Sparkles },
  { text: "Processing with care 💙", icon: Heart },
  { text: "Almost there... 🏁", icon: Clock }
];

const FunLoadingAnimation: React.FC<FunLoadingAnimationProps> = ({ 
  loadingTexts,
  interval = 2500,
  variant
}) => {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Select appropriate texts based on variant
  const texts = loadingTexts ? 
    loadingTexts.map(text => ({ text, icon: Heart })) : 
    (
      variant === 'transcript' ? transcriptLoadingTexts :
      variant === 'summary' ? summaryLoadingTexts :
      variant === 'analysis' ? analysisLoadingTexts :
      defaultLoadingTexts
    );

  useEffect(() => {
    const timer = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
        setIsTransitioning(false);
      }, 300);
    }, interval);

    return () => clearInterval(timer);
  }, [texts.length, interval]);

  const CurrentIcon = texts[currentTextIndex].icon;

  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-8">
      {/* Animated icon container */}
      <div className="relative">
        {/* Background pulse effect */}
        <div className="absolute inset-0 -m-8">
          <div className="w-24 h-24 bg-gradient-to-r from-blue-400 to-teal-400 rounded-full animate-pulse opacity-20 blur-xl" />
        </div>
        
        {/* Main icon with rotation and scale effects */}
        <div className={`
          relative z-10 w-16 h-16 flex items-center justify-center
          transition-all duration-500 transform
          ${isTransitioning ? 'scale-90 rotate-12 opacity-50' : 'scale-100 rotate-0 opacity-100'}
        `}>
          <CurrentIcon 
            size={40} 
            className={`
              text-transparent bg-gradient-to-r from-blue-500 to-teal-500 
              ${variant === 'transcript' ? 'from-teal-500 to-emerald-500' : ''}
              ${variant === 'summary' ? 'from-blue-500 to-purple-500' : ''}
              ${variant === 'analysis' ? 'from-purple-500 to-pink-500' : ''}
            `}
            style={{
              fill: 'url(#gradient)',
              stroke: 'url(#gradient)'
            }}
          />
          {/* SVG gradient definition */}
          <svg width="0" height="0">
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={
                  variant === 'transcript' ? '#14b8a6' :
                  variant === 'summary' ? '#3b82f6' :
                  variant === 'analysis' ? '#a855f7' :
                  '#3b82f6'
                } />
                <stop offset="100%" stopColor={
                  variant === 'transcript' ? '#10b981' :
                  variant === 'summary' ? '#a855f7' :
                  variant === 'analysis' ? '#ec4899' :
                  '#14b8a6'
                } />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Orbiting dots */}
        <div className="absolute inset-0 -m-4 animate-spin-slow">
          {[0, 120, 240].map((rotation, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-gradient-to-r from-blue-400 to-teal-400 rounded-full"
              style={{
                top: '50%',
                left: '50%',
                transform: `rotate(${rotation}deg) translateX(32px) translateY(-50%)`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Animated text */}
      <div className="relative h-8 flex items-center">
        <p className={`
          text-lg font-medium bg-gradient-to-r bg-clip-text text-transparent
          transition-all duration-500 transform
          ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
          ${variant === 'transcript' ? 'from-teal-600 to-emerald-600' : ''}
          ${variant === 'summary' ? 'from-blue-600 to-purple-600' : ''}
          ${variant === 'analysis' ? 'from-purple-600 to-pink-600' : ''}
          ${!variant ? 'from-blue-600 to-teal-600' : ''}
        `}>
          {texts[currentTextIndex].text}
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex space-x-1">
        {texts.map((_, index) => (
          <div
            key={index}
            className={`
              h-1 rounded-full transition-all duration-300
              ${index === currentTextIndex ? 'w-8 bg-gradient-to-r from-blue-500 to-teal-500' : 'w-1 bg-gray-300'}
            `}
          />
        ))}
      </div>
    </div>
  );
};

export default FunLoadingAnimation;