'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 50);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Fixed Header */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${headerScrolled ? 'py-3 shadow-md' : 'py-4 shadow-sm'} bg-white/98 backdrop-blur-sm`}>
        <div className="max-w-6xl mx-auto px-8 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 transition-transform hover:-translate-y-0.5">
            <div className="relative w-10 h-10 bg-gradient-to-br from-blue-400 to-teal-500 rounded-full flex items-center justify-center overflow-hidden shadow-lg">
              <span className="text-white font-bold text-sm relative z-10">AI</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
            </div>
            <span className="text-xl font-bold text-gray-900">Med Intake</span>
          </Link>
          <nav className="flex gap-6 text-sm text-gray-600">
            <Link href="/" className="hover:text-teal-600 transition-colors">Home</Link>
            <Link href="/privacy" className="text-teal-600 font-medium">Privacy</Link>
            <Link href="/security" className="hover:text-teal-600 transition-colors">Security</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-8 px-8 max-w-4xl mx-auto">
        <div className={`transition-all duration-800 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
            <span className="bg-gradient-to-r from-gray-900 via-teal-600 to-gray-900 bg-clip-text text-transparent animate-gradient">
              Privacy Policy
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          {/* Important Notice */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-6 mb-12">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white font-bold text-lg">!</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-amber-900 mb-2">Important Notice</h3>
                <p className="text-amber-800">
                  AI Med Intake is currently in beta testing and is <strong>NOT HIPAA compliant</strong> at this time. 
                  This service is for demonstration purposes only and should not be used with real patient data. 
                  Do not enter any actual personal health information.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="pb-16 px-8 max-w-4xl mx-auto">
        <div className={`space-y-12 transition-all duration-800 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          
          {/* Introduction */}
          <div className="bg-gray-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-teal-500 rounded-full"></div>
              Introduction
            </h2>
            <p className="text-gray-700 leading-relaxed">
              AI Med Intake ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, 
              use, and safeguard information when you use our AI-powered medical intake demonstration service. By using our service, 
              you agree to the collection and use of information in accordance with this policy.
            </p>
          </div>

          {/* Information We Collect */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
              Information We Collect
            </h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Demo Information</h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>Simulated patient intake conversations (no real health data should be entered)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>Voice recordings during demo sessions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>Transcripts of demo conversations</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Technical Information</h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>Browser type and version</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>Device information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>IP address (for security purposes)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                    <span>Usage analytics and performance metrics</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* How We Use Information */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-purple-500 rounded-full"></div>
              How We Use Your Information
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>We use the collected information for:</p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2"></div>
                  <span>Providing and improving our AI medical intake demonstration</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2"></div>
                  <span>Training and improving our AI models using anonymized data</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2"></div>
                  <span>Analyzing usage patterns to enhance user experience</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2"></div>
                  <span>Troubleshooting technical issues</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-2"></div>
                  <span>Communicating with users about the service</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Data Security */}
          <div className="bg-gray-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-green-500 rounded-full"></div>
              Data Security
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>
                While we implement reasonable security measures to protect your information, please note:
              </p>
              <ul className="space-y-3 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <span>This is a <strong>demonstration service</strong> not intended for real patient data</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <span>We use encryption for data in transit</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <span>Access to data is restricted to authorized personnel only</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <span>Demo data is automatically purged after 30 days</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Third-Party Services */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
              Third-Party Services
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>Our service uses the following third-party providers:</p>
              <ul className="space-y-3 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Ultravox</strong> - For voice conversation processing
                    <p className="text-sm text-gray-600 mt-1">Processes voice interactions and generates transcripts</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Cloud Infrastructure Providers</strong> - For hosting and computing
                    <p className="text-sm text-gray-600 mt-1">May include AWS, Google Cloud, or similar services</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2"></div>
                  <div>
                    <strong>AI Model Providers</strong> - For clinical analysis
                    <p className="text-sm text-gray-600 mt-1">Advanced language models for processing medical conversations</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Your Rights */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-teal-500 rounded-full"></div>
              Your Rights
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>You have the right to:</p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                  <span>Request deletion of any demo data associated with your session</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                  <span>Opt out of analytics tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                  <span>Request information about what data we have collected</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-2"></div>
                  <span>Contact us with privacy concerns</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Medical Disclaimer */}
          <div className="bg-red-50 rounded-xl border-2 border-red-200 p-8">
            <h2 className="text-2xl font-bold text-red-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-red-500 rounded-full"></div>
              Medical Disclaimer
            </h2>
            
            <div className="space-y-4 text-red-800">
              <p className="font-medium">
                AI Med Intake is NOT a medical service and should NOT be used for actual medical purposes.
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></div>
                  <span>This is a technology demonstration only</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></div>
                  <span>Do not rely on this service for medical advice</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></div>
                  <span>Always consult qualified healthcare professionals for medical concerns</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2"></div>
                  <span>No doctor-patient relationship is created through use of this service</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-teal-500 rounded-full"></div>
              Contact Us
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>
                If you have questions about this Privacy Policy or our practices, please contact us:
              </p>
              <div className="bg-white/70 backdrop-blur-sm rounded-lg p-6 space-y-3">
                <p className="flex items-center gap-3">
                  <span className="font-semibold">Company:</span>
                  <span>BuildAI</span>
                </p>
                <p className="flex items-center gap-3">
                  <span className="font-semibold">Project:</span>
                  <span>AI Med Intake</span>
                </p>
                <p className="flex items-center gap-3">
                  <span className="font-semibold">Contact:</span>
                  <span>Jake Moroshek</span>
                </p>
              </div>
            </div>
          </div>

          {/* Updates to Policy */}
          <div className="bg-gray-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-gray-500 rounded-full"></div>
              Updates to This Policy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
              Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy 
              Policy periodically for any changes.
            </p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 py-8 px-8 mt-16 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <img 
              src="/BuildAI logo.png" 
              alt="BuildAI Logo" 
              className="w-6 h-6 object-contain"
            />
            <span className="font-semibold text-gray-900">AI Med Intake</span>
          </div>
          
          <div className="flex gap-8 text-sm text-gray-600">
            <Link href="/" className="hover:text-teal-600 transition-colors">Home</Link>
            <Link href="/privacy" className="text-teal-600">Privacy</Link>
            <Link href="/security" className="hover:text-teal-600 transition-colors">Security</Link>
          </div>
          
          <div className="text-sm text-gray-500">
            <span>BuildAI © 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}