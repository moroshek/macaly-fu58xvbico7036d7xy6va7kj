'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SecurityPage() {
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
            <Link href="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
            <Link href="/security" className="text-teal-600 font-medium">Security</Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-8 px-8 max-w-4xl mx-auto">
        <div className={`transition-all duration-800 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
            <span className="bg-gradient-to-r from-gray-900 via-purple-600 to-gray-900 bg-clip-text text-transparent animate-gradient">
              Security Overview
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8">
            Understanding our security practices and current limitations
          </p>

          {/* Critical Notice */}
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-12">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white font-bold text-lg">⚠</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-900 mb-2">Critical Security Notice</h3>
                <p className="text-red-800">
                  AI Med Intake is a <strong>demonstration platform</strong> currently in beta testing. 
                  It is <strong>NOT HIPAA compliant</strong> and should <strong>NOT be used for real patient data</strong>. 
                  This service is for evaluation and demonstration purposes only.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="pb-16 px-8 max-w-4xl mx-auto">
        <div className={`space-y-12 transition-all duration-800 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          
          {/* Current Security Status */}
          <div className="bg-gray-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-purple-500 rounded-full"></div>
              Current Security Status
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-2xl">✓</span>
                  What We Have
                </h3>
                <ul className="space-y-2 text-gray-700 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                    <span>HTTPS encryption for all data in transit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                    <span>Secure API endpoints with authentication</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                    <span>Automated data purging (30 days)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                    <span>Access logging and monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                    <span>Regular security updates</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-6 border border-red-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="text-2xl">✗</span>
                  What We Don't Have (Yet)
                </h3>
                <ul className="space-y-2 text-gray-700 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5"></div>
                    <span>HIPAA compliance certification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5"></div>
                    <span>Business Associate Agreements (BAAs)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5"></div>
                    <span>PHI encryption at rest</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5"></div>
                    <span>Audit controls for HIPAA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5"></div>
                    <span>SOC 2 Type II certification</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Technical Security Measures */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
              Technical Security Measures
            </h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-xl">🔒</span>
                  Data Transmission
                </h3>
                <p className="text-gray-700 mb-3">All data transmitted between your browser and our servers is encrypted using:</p>
                <ul className="space-y-2 text-gray-600 ml-6">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>TLS 1.3 encryption protocols</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Secure WebSocket connections for real-time communication</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Certificate-based authentication</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-xl">🖥️</span>
                  Infrastructure Security
                </h3>
                <p className="text-gray-700 mb-3">Our infrastructure includes:</p>
                <ul className="space-y-2 text-gray-600 ml-6">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Cloud-based deployment with security best practices</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Network isolation and firewall rules</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Regular security patches and updates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>DDoS protection</span>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-xl">🗑️</span>
                  Data Retention
                </h3>
                <p className="text-gray-700 mb-3">Our data retention practices:</p>
                <ul className="space-y-2 text-gray-600 ml-6">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Demo session data is automatically deleted after 30 days</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Voice recordings are processed and immediately discarded</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span>Users can request immediate data deletion</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Limitations and Disclaimers */}
          <div className="bg-amber-50 rounded-xl border-2 border-amber-200 p-8">
            <h2 className="text-2xl font-bold text-amber-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-amber-500 rounded-full"></div>
              Important Limitations
            </h2>
            
            <div className="space-y-4 text-amber-800">
              <p className="font-medium">
                As a demonstration platform, AI Med Intake has significant security limitations:
              </p>
              <ul className="space-y-3 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Not for Protected Health Information (PHI)</strong>
                    <p className="text-sm mt-1">Never enter real patient names, dates of birth, medical record numbers, or actual health conditions</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2"></div>
                  <div>
                    <strong>No Clinical Decision Support</strong>
                    <p className="text-sm mt-1">AI outputs are for demonstration only and should never be used for actual medical decisions</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Third-Party Dependencies</strong>
                    <p className="text-sm mt-1">We rely on external services that may have their own security considerations</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Beta Software</strong>
                    <p className="text-sm mt-1">This platform is under active development and may contain bugs or vulnerabilities</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Enterprise Security Options */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-purple-500 rounded-full"></div>
              Enterprise Security Solutions
            </h2>
            
            <p className="text-gray-700 mb-6">
              For healthcare organizations requiring HIPAA-compliant solutions, we offer:
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-xl">🏥</span>
                  Private Cloud Deployment
                </h3>
                <ul className="space-y-2 text-gray-600 text-sm">
                  <li>• Deploy within your HIPAA-compliant infrastructure</li>
                  <li>• Full data sovereignty and control</li>
                  <li>• Custom security policies</li>
                  <li>• Integration with existing security tools</li>
                </ul>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  Compliance Package
                </h3>
                <ul className="space-y-2 text-gray-600 text-sm">
                  <li>• Business Associate Agreement (BAA)</li>
                  <li>• HIPAA compliance documentation</li>
                  <li>• Security audit support</li>
                  <li>• Dedicated compliance team</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-gray-600 mb-4">Interested in a secure, compliant deployment?</p>
              <a href="#" className="inline-flex items-center gap-2 px-6 py-3 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                Contact Enterprise Sales
                <span>→</span>
              </a>
            </div>
          </div>

          {/* Reporting Security Issues */}
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-red-500 rounded-full"></div>
              Reporting Security Issues
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>
                We take security seriously. If you discover a security vulnerability, please:
              </p>
              <ol className="space-y-3 ml-6 list-decimal">
                <li>
                  <strong>Do not</strong> publicly disclose the issue until we've had a chance to address it
                </li>
                <li>
                  Contact us immediately with details of the vulnerability
                </li>
                <li>
                  Provide sufficient information to reproduce the issue
                </li>
                <li>
                  Allow reasonable time for us to respond and fix the issue
                </li>
              </ol>
              
              <div className="bg-gray-50 rounded-lg p-6 mt-6">
                <p className="font-semibold mb-2">Security Contact:</p>
                <p>BuildAI Security Team</p>
                <p className="text-sm text-gray-600">Response time: Within 48 hours</p>
              </div>
            </div>
          </div>

          {/* Best Practices for Users */}
          <div className="bg-gray-50 rounded-xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-green-500 rounded-full"></div>
              Best Practices for Demo Users
            </h2>
            
            <div className="space-y-4 text-gray-700">
              <p>To ensure safe use of our demonstration platform:</p>
              <ul className="space-y-3 ml-4">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Use fictional data only</strong>
                    <p className="text-sm text-gray-600 mt-1">Create realistic but completely fictional patient scenarios</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Avoid personal information</strong>
                    <p className="text-sm text-gray-600 mt-1">Don't use your own or anyone else's real health information</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Use modern browsers</strong>
                    <p className="text-sm text-gray-600 mt-1">Keep your browser updated for the latest security features</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <strong>Report suspicious activity</strong>
                    <p className="text-sm text-gray-600 mt-1">Contact us if you notice anything unusual</p>
                  </div>
                </li>
              </ul>
            </div>
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
            <Link href="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
            <Link href="/security" className="text-teal-600">Security</Link>
          </div>
          
          <div className="text-sm text-gray-500">
            <span>BuildAI © 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
}