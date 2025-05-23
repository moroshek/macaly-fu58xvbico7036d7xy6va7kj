import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="container mx-auto py-4 px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
              <span className="text-white font-semibold">AI</span>
            </div>
            <span className="font-semibold text-lg">MedIntake</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto py-12 md:py-24 px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Intelligent, Faster Medical Intake</h1>
                <p className="text-xl text-gray-500">
                  Answer preliminary questions quickly and easily using our secure voice-powered AI assistant before you
                  see the doctor.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-2.5 bg-white">
                  <Shield className="h-3.5 w-3.5 text-teal-500" />
                  <span>HIPAA Compliant</span>
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-2.5 bg-white">
                  <Lock className="h-3.5 w-3.5 text-teal-500" />
                  <span>Secure Encryption</span>
                </Badge>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  This is beta software. Do not use this as medical advice. The AI will simulate the type of information it can provide to your provider to expedite intake.
                  <Link href="/privacy" className="ml-1 text-teal-600 hover:underline">
                    Learn more
                  </Link>
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <Link href="/intake" className="text-teal-600 hover:underline">
                    Skip voice, I'd rather chat instead
                  </Link>
                </div>
              </div>
            </div>
            <Link href="/intake?tab=voice" className="relative h-[400px] rounded-lg overflow-hidden bg-gradient-to-br from-teal-50 to-blue-50 cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99]">
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-full max-w-md flex flex-col items-center">
                  {/* Audio waveform animation */}
                  <div className="flex items-center justify-center space-x-1 h-32 mb-6">
                    {[...Array(20)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 bg-teal-500 rounded-full opacity-70 animate-pulse`}
                        style={{
                          height: `${Math.sin(i / 3) * 30 + 40}px`,
                          animationDelay: `${i * 50}ms`,
                          animationDuration: `${800 + (i % 4) * 300}ms`,
                        }}
                      ></div>
                    ))}
                  </div>

                  {/* Text prompt */}
                  <div className="text-center">
                    <p className="text-lg font-medium text-teal-700">Click here to speak</p>
                    <p className="text-sm text-gray-500 mt-2">Our AI assistant is ready to listen</p>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </section>

        <section className="bg-gray-50 py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold">How It Works</h2>
              <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
                Our AI-powered intake process is designed to be simple, secure, and efficient
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">1</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Start Your Intake</h3>
                <p className="text-gray-500">
                  Begin the process with a simple click. No downloads or complicated setup required.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">2</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Answer Questions</h3>
                <p className="text-gray-500">
                  Speak naturally with our AI assistant or type your responses to medical questions.
                </p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-teal-600 font-semibold">3</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">See Your Doctor</h3>
                <p className="text-gray-500">
                  Your provider receives your information instantly, making your consultation more efficient.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-100 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
                <span className="text-white font-semibold text-xs">AI</span>
              </div>
              <span className="font-semibold">MedIntake</span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 mb-4 md:mb-0">
              <Link href="/terms" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">
                Terms of Service
              </Link>
              <Link href="/privacy" className="text-sm text-gray-500 hover:text-teal-600 transition-colors">
                Privacy Policy
              </Link>
            </div>
            <div className="text-sm text-gray-500">Jake Moroshek | BuildAI © 2025</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
