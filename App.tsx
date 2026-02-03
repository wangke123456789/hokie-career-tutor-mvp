
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { extractTextFromPdf } from './services/pdfService';
import { analyzeResume, startInterviewChat, generateInterviewReport } from './services/geminiService';
import { ResumeData, AnalysisResult, AppMode, ChatMessage, InterviewType } from './types';

const IconUpload = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>;
const IconSparkles = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>;
const IconSend = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IconMic = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>;
const IconVideo = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
const IconText = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('ANALYZE');
  const [interviewType, setInterviewType] = useState<InterviewType | null>(null);
  const [showModeSelection, setShowModeSelection] = useState(false);
  
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [jd, setJd] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResult>({ content: '', isStreaming: false });
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Interview state
  const [chatSession, setChatSession] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInputValue(transcript);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  // Handle Camera for Video Mode
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (mode === 'INTERVIEW' && interviewType === 'VIDEO' && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => console.error("Camera access failed", err));
    }
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [mode, interviewType]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading]);

  // TTS Logic
  const speak = (text: string) => {
    if (interviewType === 'VIDEO') {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setIsExtracting(true);
      try {
        const text = await extractTextFromPdf(file);
        setResume({ text, fileName: file.name });
      } catch (err) { alert('Failed to extract PDF'); }
      finally { setIsExtracting(false); }
    }
  };

  const handleAnalyze = async () => {
    if (!resume || !jd.trim()) return;
    setMode('ANALYZE');
    setAnalysis({ content: '', isStreaming: true });
    try {
      await analyzeResume(resume.text, jd, (chunk) => {
        setAnalysis(prev => ({ ...prev, content: prev.content + chunk }));
      });
    } catch (err) {
      setAnalysis(prev => ({ ...prev, error: 'Analysis failed.' }));
    } finally {
      setAnalysis(prev => ({ ...prev, isStreaming: false }));
    }
  };

  const initInterview = async (type: InterviewType) => {
    if (!resume || !jd) return;
    setInterviewType(type);
    setShowModeSelection(false);
    setMode('INTERVIEW');
    setMessages([]);
    setIsChatLoading(true);
    const session = startInterviewChat(resume.text, jd, type);
    setChatSession(session);
    
    try {
      const response = await session.sendMessage({ message: "Hello. I am ready for the interview. Please start." });
      const responseText = response.text;
      setMessages([{ role: 'model', parts: [{ text: responseText }] }]);
      speak(responseText);
    } catch (e) {
      alert("Failed to start session.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || !chatSession || isChatLoading) return;
    if (isListening) stopListening();

    const userMsg: ChatMessage = { role: 'user', parts: [{ text: inputValue }] };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = inputValue;
    setInputValue('');
    setIsChatLoading(true);

    try {
      const stream = await chatSession.sendMessageStream({ message: currentInput });
      let fullText = '';
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
      
      for await (const chunk of stream) {
        fullText += chunk.text;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'model', parts: [{ text: fullText }] };
          return updated;
        });
      }
      speak(fullText);
    } catch (e) {
      alert("Connection error.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const startListening = () => {
    if (recognitionRef.current) {
      setIsListening(true);
      recognitionRef.current.start();
    } else {
      alert("Speech recognition not supported in this browser.");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const endInterview = async () => {
    window.speechSynthesis.cancel();
    if (messages.length < 2) {
      setMode('ANALYZE');
      setInterviewType(null);
      return;
    }
    setIsChatLoading(true);
    try {
      const report = await generateInterviewReport(messages);
      setAnalysis({ content: report, isStreaming: false });
      setMode('REPORT');
    } catch (e) {
      alert("Report failed.");
    } finally {
      setIsChatLoading(false);
      setInterviewType(null);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-gray-800">
      {/* Navbar */}
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setMode('ANALYZE'); setInterviewType(null); }}>
          <div className="bg-indigo-600 p-2 rounded-lg text-white"><IconSparkles /></div>
          <h1 className="text-xl font-bold tracking-tight">Career Pro AI</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-mono bg-gray-100 px-3 py-1 rounded-full text-gray-500">
            {mode} {interviewType ? `(${interviewType})` : ''}
          </div>
        </div>
      </nav>

      {/* Mode Selection Modal */}
      {showModeSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold text-center mb-8">Choose Your Interview Format</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <button 
                onClick={() => initInterview('TEXT')}
                className="group border-2 border-gray-100 hover:border-indigo-500 rounded-2xl p-6 text-left transition-all hover:shadow-lg bg-gray-50 hover:bg-white"
              >
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <IconText />
                </div>
                <h3 className="font-bold text-lg mb-2">Text Mode</h3>
                <p className="text-sm text-gray-500">Chat-based technical evaluation. Quiet and thoughtful environment.</p>
              </button>
              
              <button 
                onClick={() => initInterview('VIDEO')}
                className="group border-2 border-gray-100 hover:border-indigo-500 rounded-2xl p-6 text-left transition-all hover:shadow-lg bg-gray-50 hover:bg-white"
              >
                <div className="bg-rose-100 text-rose-600 p-3 rounded-xl w-fit mb-4 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <IconVideo />
                </div>
                <h3 className="font-bold text-lg mb-2">Video Mode</h3>
                <p className="text-sm text-gray-500">Face-to-face simulation. Includes voice interaction and AI speech synthesis.</p>
              </button>
            </div>
            <button 
              onClick={() => setShowModeSelection(false)}
              className="mt-8 w-full text-gray-400 hover:text-gray-600 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'INTERVIEW' ? (
        /* Interview Interface (Split if Video) */
        <div className="flex-1 flex bg-gray-50 overflow-hidden relative">
          <div className="absolute top-4 left-0 right-0 z-10 flex justify-center">
             <button onClick={endInterview} className="bg-white text-red-600 border border-red-200 px-6 py-2 rounded-full text-sm font-bold hover:bg-red-50 transition-all shadow-md active:scale-95">
               End Session & Generate Report
             </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left side: Camera Preview for Video Mode */}
            {interviewType === 'VIDEO' && (
              <div className="hidden lg:block w-1/2 p-8 pt-20">
                <div className="relative h-full rounded-3xl overflow-hidden bg-black shadow-2xl border-4 border-white">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    Interviewing Live
                  </div>
                </div>
              </div>
            )}

            {/* Right side: Chat */}
            <div className={`flex flex-col flex-1 h-full pt-16 ${interviewType === 'VIDEO' ? 'lg:w-1/2' : 'w-full max-w-3xl mx-auto'}`}>
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] md:max-w-[80%] rounded-2xl p-4 shadow-sm ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border border-gray-100'
                    }`}>
                      {/* Fixed: Wrapped ReactMarkdown in a div because it may not accept className directly in some type versions */}
                      <div className={`prose prose-sm prose-p:leading-relaxed ${msg.role === 'user' ? 'prose-invert' : ''}`}>
                        <ReactMarkdown>
                          {msg.parts[0].text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isChatLoading && !messages[messages.length-1]?.parts[0].text && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl px-6 py-4 shadow-sm border border-gray-100 flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      </div>
                      <span className="text-xs text-gray-400 font-medium">AI Interviewer is thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 md:p-8 bg-white/80 backdrop-blur-sm border-t shrink-0">
                <div className="max-w-4xl mx-auto flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder={isListening ? "Listening..." : "Type or speak your answer..."}
                      disabled={isChatLoading}
                      className={`w-full border rounded-2xl px-5 py-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all pr-12 ${
                        isListening ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-inner' : 'border-gray-200'
                      }`}
                    />
                    {interviewType === 'VIDEO' && (
                      <button 
                        onClick={isListening ? stopListening : startListening}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                          isListening ? 'bg-red-500 text-white shadow-lg scale-110' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'
                        }`}
                      >
                        <IconMic />
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={sendMessage}
                    disabled={isChatLoading || !inputValue.trim()}
                    className="bg-indigo-600 text-white p-4 rounded-2xl hover:bg-indigo-700 disabled:bg-gray-300 transition-all shadow-lg active:scale-95 flex items-center justify-center w-14 h-14"
                  >
                    <IconSend />
                  </button>
                </div>
                {interviewType === 'VIDEO' && (
                  <p className="text-center text-[10px] text-gray-400 mt-3 uppercase tracking-widest font-bold">
                    Video Mode Active • Voice Synthesis ON
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Analyze & Report View */
        <main className="flex-1 flex overflow-hidden">
          <div className="w-full md:w-5/12 overflow-y-auto p-6 border-r bg-gray-50/50 custom-scrollbar">
            <div className="max-w-md mx-auto space-y-8">
              <section className="space-y-3">
                <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Step 1: Resume</label>
                <div className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${resume ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'}`}>
                  <input type="file" accept=".pdf" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  {isExtracting ? <div className="animate-spin h-6 w-6 border-b-2 border-indigo-600 mx-auto" /> : 
                  resume ? <div className="text-green-700 font-medium truncate">{resume.fileName}</div> : 
                  <div className="text-gray-400 flex flex-col items-center"><IconUpload /><p className="text-xs mt-2 font-medium">Upload PDF Resume</p></div>}
                </div>
              </section>

              <section className="space-y-3">
                <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Step 2: Job Context</label>
                <textarea 
                  value={jd} 
                  onChange={(e) => setJd(e.target.value)} 
                  className="w-full h-48 p-4 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                  placeholder="Paste the target Job Description..."
                />
              </section>

              <button 
                onClick={handleAnalyze} 
                disabled={!resume || !jd || analysis.isStreaming}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {analysis.isStreaming ? 'Analyzing Context...' : 'Start Matching Analysis'}
              </button>
            </div>
          </div>

          <div className="hidden md:block md:w-7/12 overflow-y-auto bg-white custom-scrollbar">
            {!analysis.content ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-300 p-12">
                <div className="bg-gray-50 p-6 rounded-full mb-6">
                  <IconSparkles />
                </div>
                <h3 className="text-lg font-semibold text-gray-400">Analysis Engine Ready</h3>
                <p className="mt-2 text-center text-sm max-w-xs">Upload your profile and JD to generate optimization insights and prep for interviews.</p>
              </div>
            ) : (
              <div className="p-8 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="prose prose-indigo max-w-none prose-headings:font-bold prose-p:text-gray-600">
                   <ReactMarkdown>{analysis.content}</ReactMarkdown>
                </div>
                
                {mode === 'ANALYZE' && !analysis.isStreaming && (
                  <div className="mt-12 p-10 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-3xl border border-indigo-200 flex flex-col items-center text-center shadow-inner">
                    <div className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg mb-6">
                      <IconSparkles />
                    </div>
                    <h3 className="text-2xl font-black text-indigo-900 mb-2">Ready for a Live Simulation?</h3>
                    <p className="text-indigo-700 mb-8 text-sm max-w-md">Our AI Interviewer can conduct a full session via chat or video to prepare you for the real deal.</p>
                    <button 
                      onClick={() => setShowModeSelection(true)}
                      className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
                    >
                      Enter Mock Interview Chamber
                    </button>
                  </div>
                )}

                {mode === 'REPORT' && (
                  <div className="mt-8 flex justify-center">
                    <button onClick={() => { setMode('ANALYZE'); setAnalysis({ content: '', isStreaming: false }); }} className="text-indigo-600 font-bold hover:underline flex items-center gap-2">
                      ← Start Over / New Analysis
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
};

export default App;
