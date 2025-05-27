"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

export default function IntakePage() {
  // Check for URL parameter to determine which tab to show initially
  const [activeTab, setActiveTab] = useState("voice");
  
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([{
    role: "assistant",
    content: "Hello! I'm your medical intake assistant. What brings you in today?",
  }]);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [responseAudioURL, setResponseAudioURL] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  
  // Effect to check URL parameters when component mounts
  useEffect(() => {
    // Get the 'tab' query parameter from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    
    // If tab parameter exists and is valid, set it as the active tab
    if (tabParam && (tabParam === 'voice' || tabParam === 'chat')) {
      setActiveTab(tabParam);
      console.log("Setting active tab from URL parameter:", tabParam);
    }
  }, []);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    // Add user message
    const newMessages = [...messages, { role: "user" as const, content: inputValue }];
    setMessages(newMessages);
    console.log("User message sent:", inputValue);
    setInputValue("");
    
    // Simulate AI response
    setTimeout(() => {
      setMessages([...newMessages, {
        role: "assistant" as const, 
        content: "Thank you for sharing that information. Could you tell me more about your symptoms or when they started?"
      }]);
      console.log("Assistant response added");
    }, 1000);
  };

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        console.log("Recording stopped and saved");
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      console.log("Recording started");
      
      toast({
        title: "Recording Started",
        description: "Speak clearly into your microphone. Recording will automatically stop after 15 seconds.",
      });
      
      // Auto-stop after 15 seconds
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          stopRecording();
        }
      }, 15000);
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Recording Error",
        description: "Could not access your microphone. Please check your permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      console.log("Recording stopped");
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
      setAudioURL(null);
      console.log("Recording canceled");
    }
  };

  const processAudio = async () => {
    if (!audioURL) return;
    
    try {
      setIsProcessing(true);
      console.log("Processing audio...");
      
      // Fetch the recorded blob from the URL
      const response = await fetch(audioURL);
      const audioBlob = await response.blob();
      
      // Create FormData and append the audio file
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'recording.wav');
      
      // Send to the API
      const apiResponse = await axios.post(
        'https://ai-medical-intake-service-191450583446.us-central1.run.app/intake/process_audio',
        formData,
        {
          responseType: 'blob',
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      
      // Create URL for the response audio
      const responseAudioBlob = new Blob([apiResponse.data], { type: 'audio/mpeg' });
      const responseUrl = URL.createObjectURL(responseAudioBlob);
      setResponseAudioURL(responseUrl);
      console.log("Response audio received and ready to play");
      
      // Add transcription placeholder in chat (in a real app, you'd get this from the API)
      const newMessages = [...messages, 
        { role: "user" as const, content: "[Audio message sent]" },
        { role: "assistant" as const, content: "[Audio response received]" }
      ];
      setMessages(newMessages);
      
      // Auto-play the response
      if (audioRef.current) {
        audioRef.current.src = responseUrl;
        audioRef.current.play();
      }
      
      toast({
        title: "Processing Complete",
        description: "Your audio has been processed. Listen to the response.",
      });
    } catch (error) {
      console.error("Error processing audio:", error);
      toast({
        title: "Processing Error",
        description: "An error occurred while processing your audio. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      // Create URL for the uploaded file
      const fileUrl = URL.createObjectURL(file);
      setAudioURL(fileUrl);
      console.log("Audio file uploaded");
      
      toast({
        title: "File Uploaded",
        description: "Your audio file is ready to be processed.",
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Upload Error",
        description: "An error occurred while uploading your file. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white border-b z-10">
        <div className="container mx-auto py-4 px-4 md:px-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
                <span className="text-white font-semibold">AI</span>
              </div>
              <span className="font-semibold text-lg">MedIntake</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto py-8 px-4 md:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-3xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="voice" className="text-sm md:text-base">Voice Intake</TabsTrigger>
            <TabsTrigger value="chat" className="text-sm md:text-base">Text Chat</TabsTrigger>
          </TabsList>
          
          <TabsContent value="voice" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Voice Medical Intake</CardTitle>
                <CardDescription>
                  Speak to our AI assistant or upload an audio file to begin your medical intake process.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center justify-center space-y-8 py-6">
                  {!isProcessing && !responseAudioURL ? (
                    <div className="space-y-6 w-full max-w-md">
                      <div className="flex flex-col gap-2 items-center">
                        <Button 
                          onClick={startRecording} 
                          disabled={isRecording || audioURL !== null}
                          className={`w-24 h-24 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'}`}
                        >
                          <Mic size={36} />
                        </Button>
                        <p className="text-sm text-gray-500">
                          {isRecording ? 'Recording... (Auto-stops after 15s)' : 'Start Recording'}
                        </p>
                      </div>
                      
                      {isRecording && (
                        <div className="flex justify-center">
                          <Button 
                            onClick={stopRecording}
                            variant="outline" 
                            className="flex items-center gap-2"
                          >
                            <X size={16} />
                            Stop Recording
                          </Button>
                        </div>
                      )}
                      
                      {!isRecording && !audioURL && (
                        <div className="flex items-center justify-center">
                          <div className="relative w-full max-w-xs">
                            <Button 
                              variant="outline" 
                              className="w-full flex items-center gap-2"
                              onClick={() => document.getElementById('audio-upload')?.click()}
                            >
                              <Upload size={16} />
                              Upload Audio File
                            </Button>
                            <input 
                              type="file" 
                              id="audio-upload"
                              accept="audio/*"
                              className="hidden"
                              onChange={handleFileUpload}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6 w-full max-w-md">
                      {audioURL && !isProcessing && (
                        <div className="flex flex-col items-center gap-4">
                          <audio controls src={audioURL} className="w-full" />
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              onClick={() => setAudioURL(null)}
                              className="flex items-center gap-1"
                            >
                              <X size={16} />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {isProcessing && (
                        <div className="flex flex-col items-center gap-4 py-8">
                          <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center relative">
                            <Loader2 size={32} className="text-teal-500 animate-spin" />
                            <span className="absolute w-full h-full rounded-full animate-ping bg-teal-200 opacity-30"></span>
                          </div>
                          <div className="text-center">
                            <h3 className="font-medium text-lg">AI is processing your audio</h3>
                            <p className="text-sm text-gray-500">This will take just a few moments...</p>
                          </div>
                          <div className="mt-2 flex flex-col items-center">
                            <div className="h-1 w-48 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500 rounded-full animate-pulse" style={{ width: '75%' }}></div>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Converting speech to medical summary...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {responseAudioURL && (
                  <div className="border-t pt-6">
                    <h3 className="font-medium mb-3">AI Response:</h3>
                    <audio 
                      ref={audioRef}
                      controls 
                      src={responseAudioURL} 
                      className="w-full" 
                      autoPlay 
                    />
                  </div>
                )}
              </CardContent>
              <CardFooter className="text-xs text-gray-500 flex flex-col items-start">
                <p className="mb-1">This is a demo of an AI-powered medical intake system. Voice data is processed securely.</p>
                <p>All data is encrypted and HIPAA compliant.</p>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="chat">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Medical Intake Chat</CardTitle>
                <CardDescription>
                  Please answer the questions to help us prepare for your appointment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4 max-h-[500px] overflow-y-auto p-2">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${message.role === "user" ? "bg-teal-500 text-white" : "bg-gray-100 text-gray-800"}`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <Textarea
                    placeholder="Type your response here..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button onClick={handleSendMessage} className="bg-teal-500 hover:bg-teal-600">
                    Send
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="text-xs text-gray-500">
                This is a simulated medical intake chat. In a real application, this would be connected to a secure AI system.
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="bg-gray-100 py-6">
        <div className="container mx-auto px-4 md:px-6 text-center text-sm text-gray-500">
          Jake Moroshek | BuildAI © 2025
        </div>
      </footer>
    </div>
  );
}