import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto py-4 px-4 md:px-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
              <span className="text-white font-semibold">AI</span>
            </div>
            <span className="font-semibold text-lg">MedIntake</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto py-12 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
          
          <div className="prose prose-lg">
            <p className="text-sm text-gray-500 mb-8">
              <strong>Last Updated:</strong> May 23, 2025
            </p>

            <p className="mb-4">
              This Privacy Policy describes how the AI Medical Intake Proof-of-Concept (PoC) application ("the App") handles your information. This App is an experimental demonstration tool.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">1. Information We Collect</h2>
            <ul className="list-disc pl-6 mb-4">
              <li className="mb-2"><strong>Audio Input:</strong> When you speak into the App, your audio recording is temporarily collected.</li>
              <li className="mb-2"><strong>Transcribed Text:</strong> Your spoken input is converted into text via an Automatic Speech Recognition (ASR) service.</li>
              <li className="mb-2"><strong>AI-Generated Text & Audio:</strong> The transcribed text is sent to an Artificial Intelligence (AI) model, which generates a text response. This text response is then converted into audio via a Text-to-Speech (TTS) service.</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">2. How Your Information is Used (for PoC Demonstration)</h2>
            <ul className="list-disc pl-6 mb-4">
              <li className="mb-2">The audio input is used solely for the purpose of transcribing your speech.</li>
              <li className="mb-2">The transcribed text is used solely for the purpose of generating an AI response related to medical intake.</li>
              <li className="mb-2">The AI-generated text is used solely for the purpose of synthesizing an audio response.</li>
              <li className="mb-2">Your data is processed in real-time to provide the App's functionality.</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">3. Data Sharing and Third-Party Services</h2>
            <p className="mb-4">
              To provide its functionality, this App utilizes third-party AI services:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li className="mb-2"><strong>Automatic Speech Recognition (ASR):</strong> Powered by Whisper (OpenAI Whisper).</li>
              <li className="mb-2"><strong>Large Language Model (LLM):</strong> Powered by Hugging Face Inference Endpoint.</li>
              <li className="mb-2"><strong>Text-to-Speech (TTS):</strong> Powered by Play.ht.</li>
            </ul>
            <p className="mb-4">
              Your audio input and generated text may be sent to these third-party services for processing. We do not control the privacy practices of these third-party services, and you should review their respective privacy policies.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">4. Data Retention (Proof of Concept Nature)</h2>
            <ul className="list-disc pl-6 mb-4">
              <li className="mb-2"><strong>For the purpose of this Proof-of-Concept:</strong> We aim for minimal data retention. Audio input, transcribed text, and AI-generated responses are processed in memory and generally <strong>not stored persistently</strong> on our servers or by the third-party AI providers beyond what is necessary for immediate processing of your request.</li>
              <li className="mb-2">We do not intentionally collect or store Personally Identifiable Information (PII) or Protected Health Information (PHI) from users. <strong>Users should avoid submitting sensitive or confidential medical information into this PoC App.</strong></li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">5. Data Security</h2>
            <p className="mb-4">
              We take reasonable measures to protect the information transmitted through this App. However, no internet transmission or electronic storage is 100% secure. Therefore, we cannot guarantee its absolute security.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">6. Children's Privacy</h2>
            <p className="mb-4">
              This App is not intended for use by children under the age of 13. We do not knowingly collect personal information from children under 13.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">7. Changes to This Privacy Policy</h2>
            <p className="mb-4">
              We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last Updated" date.
            </p>
            
            <h2 className="text-xl font-semibold mt-8 mb-4">8. Contact Information</h2>
            <p className="mb-4">
              This is a PoC; direct support is not provided.
            </p>
          </div>
        </div>
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
            <div className="text-sm text-gray-500">Jake Moroshek | BuildAI © {new Date().getFullYear()}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
