
import React, { useState, useEffect, useRef } from 'react';
import { parseReminderWithGemini } from '../services/geminiService';
import { User, VoiceSettings, AISettings } from '../types';
import { getTodayString } from '../constants';

interface VoiceInputProps {
  currentUser: User;
  users: User[];
  onAddReminder: (data: any) => void;
  onManualInput: () => void;
  voiceSettings: VoiceSettings;
  aiSettings: AISettings;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  type?: 'text' | 'success-card' | 'error';
  data?: any; // Store parsed reminder data for the success card
}

const VoiceInput: React.FC<VoiceInputProps> = ({ currentUser, users, onAddReminder, onManualInput, voiceSettings, aiSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState(''); // Text currently being spoken
  const [messages, setMessages] = useState<ChatMessage[]>([
      { id: 0, role: 'assistant', text: '我是您的家庭智能助手。请告诉我需要提醒什么？\n例如：“明天早上8点提醒爷爷吃药”' }
  ]);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Latest props ref to avoid stale closures
  const latestPropsRef = useRef({ currentUser, users, aiSettings, voiceSettings });
  useEffect(() => {
    latestPropsRef.current = { currentUser, users, aiSettings, voiceSettings };
  }, [currentUser, users, aiSettings, voiceSettings]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, interimText, isOpen]);

  // Check support
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setHasSpeechSupport(true);
    }
    return () => stopRecognitionInstance();
  }, []);

  const stopRecognitionInstance = () => {
      if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch(e) {}
          recognitionRef.current = null;
      }
  };

  const addMessage = (role: 'user' | 'assistant' | 'system', text: string, type: 'text' | 'success-card' | 'error' = 'text', data?: any) => {
      setMessages(prev => [...prev, { id: Date.now(), role, text, type, data }]);
  };

  const startListening = () => {
      stopRecognitionInstance();

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
          setIsListening(true);
          setInterimText('');
      };

      recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
              const result = event.results[i];
              if (result.isFinal) {
                  finalTranscript += result[0].transcript;
              } else {
                  interimTranscript += result[0].transcript;
              }
          }
          
          if (interimTranscript) setInterimText(interimTranscript);

          if (finalTranscript) {
              setInterimText(''); // Clear interim
              handleUserSpeechComplete(finalTranscript);
              try { recognition.stop(); } catch(e) {}
          }
      };

      recognition.onerror = (event: any) => {
          console.error("Speech Error:", event.error);
          setIsListening(false);
          setInterimText('');
          if (event.error === 'not-allowed') {
              addMessage('system', '无法访问麦克风，请检查权限。', 'error');
          } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
              // Ignore benign errors
              // addMessage('system', '听不清楚，请再说一次。', 'error');
          }
      };

      recognition.onend = () => {
          setIsListening(false);
      };

      try {
          recognition.start();
          recognitionRef.current = recognition;
      } catch (e) {
          console.error(e);
          setIsListening(false);
      }
  };

  const stopListening = () => {
      if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch(e) {}
      }
      setIsListening(false);
      
      // If there was text remaining in interim (force submit)
      if (interimText.trim()) {
          const text = interimText;
          setInterimText('');
          handleUserSpeechComplete(text);
      }
  };

  const handleUserSpeechComplete = async (text: string) => {
      if (!text.trim()) return;
      
      // 1. Add User Message to Chat
      addMessage('user', text);

      // 2. Process
      setIsProcessing(true);
      
      try {
          const { currentUser: curUser, users: allUsers, aiSettings: curSettings, voiceSettings: curVoice } = latestPropsRef.current;
          
          if (!curSettings.configs[curSettings.activeProvider]?.apiKey && curSettings.activeProvider !== 'custom') {
              throw new Error(`请先配置 ${curSettings.activeProvider} 的 API Key`);
          }

          const familyNames = allUsers.map(u => u.name);
          const todayStr = getTodayString();

          const result = await parseReminderWithGemini(
              text,
              curUser.name,
              familyNames,
              todayStr,
              curSettings.configs[curSettings.activeProvider],
              curSettings.activeProvider
          );

          if (result) {
              // Determine Target User
              let targetUserId = curUser.id;
              if (result.targetUser) {
                  const exactMatch = allUsers.find(u => u.name === result.targetUser);
                  if (exactMatch) targetUserId = exactMatch.id;
                  else {
                      const found = allUsers.find(u => result.targetUser!.includes(u.name));
                      if (found) targetUserId = found.id;
                  }
              }
              
              const targetUserObj = allUsers.find(u => u.id === targetUserId) || curUser;

              // Add to App State
              onAddReminder({
                  title: result.title,
                  time: result.time,
                  date: result.date,
                  userId: targetUserId,
                  type: result.type,
                  isCompleted: false
              });

              // Add Success Message to Chat
              addMessage('assistant', '已为您添加提醒：', 'success-card', { ...result, targetUserName: targetUserObj.name });

              // Audio Feedback
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
                const msg = new SpeechSynthesisUtterance();
                msg.text = `好的，已添加提醒。`;
                msg.lang = 'zh-CN';
                if (curVoice.voiceURI) {
                    const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === curVoice.voiceURI);
                    if (voice) msg.voice = voice;
                }
                window.speechSynthesis.speak(msg);
              }

          } else {
              throw new Error("未能识别出有效的提醒内容");
          }

      } catch (e: any) {
          addMessage('assistant', `抱歉，处理失败：${e.message}`, 'error');
      } finally {
          setIsProcessing(false);
      }
  };

  const toggleAssistant = () => {
      setIsOpen(!isOpen);
      if (!isOpen) {
          // Reset interaction state if needed, or keep history
          // setMessages([...initial]); // Uncomment to clear history on reopen
      }
  };

  const handleMicClick = () => {
      if (!hasSpeechSupport) {
          alert("浏览器不支持语音识别");
          return;
      }
      if (isListening) {
          stopListening();
      } else {
          startListening();
      }
  };

  return (
    <>
        {/* Floating Bar (Always Visible) */}
        {!isOpen && (
             <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
                <div className="w-full max-w-sm flex items-end gap-3 pointer-events-auto">
                    <button 
                        onClick={onManualInput}
                        className="flex-1 bg-white hover:bg-slate-50 text-slate-700 h-16 rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
                    >
                        <i className="fa-solid fa-keyboard text-xl"></i>
                        <span className="font-bold text-lg">手动添加</span>
                    </button>
                    <button
                        onClick={toggleAssistant}
                        className="h-16 w-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-200 flex items-center justify-center transition-transform active:scale-95"
                    >
                        <i className="fa-solid fa-microphone text-2xl"></i>
                    </button>
                </div>
             </div>
        )}

        {/* Chat Assistant Overlay */}
        {isOpen && (
            <div className="fixed inset-0 z-50 flex flex-col bg-slate-100/90 backdrop-blur-sm animate-fade-in">
                
                {/* Header */}
                <div className="bg-white px-4 py-3 shadow-sm flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <i className="fa-solid fa-robot"></i>
                        </div>
                        <span className="font-bold text-slate-800">智能助手</span>
                    </div>
                    <button onClick={toggleAssistant} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200">
                        <i className="fa-solid fa-times text-slate-500"></i>
                    </button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            
                            {/* Avatar for Assistant */}
                            {msg.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-white text-xs mr-2 mt-1">
                                    AI
                                </div>
                            )}

                            <div className={`max-w-[80%] space-y-2`}>
                                {/* Text Bubble */}
                                {msg.text && (
                                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm
                                        ${msg.role === 'user' 
                                            ? 'bg-blue-500 text-white rounded-br-none' 
                                            : msg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 rounded-bl-none' : 'bg-white text-slate-700 rounded-bl-none'}
                                    `}>
                                        {msg.text}
                                    </div>
                                )}

                                {/* Success Card */}
                                {msg.type === 'success-card' && msg.data && (
                                    <div className="bg-white rounded-2xl p-3 shadow-md border-l-4 border-green-500 overflow-hidden animate-scale-in">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase">提醒已创建</span>
                                            <i className="fa-solid fa-check-circle text-green-500"></i>
                                        </div>
                                        <h4 className="font-bold text-lg text-slate-800 mb-1">{msg.data.title}</h4>
                                        <div className="text-sm text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                                            <span className="flex items-center gap-1"><i className="fa-regular fa-clock text-xs"></i> {msg.data.time}</span>
                                            <span className="flex items-center gap-1"><i className="fa-regular fa-calendar text-xs"></i> {msg.data.date}</span>
                                            <span className="flex items-center gap-1"><i className="fa-solid fa-user text-xs"></i> {msg.data.targetUserName}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    {/* Real-time listening indicator */}
                    {isListening && (
                        <div className="flex justify-end">
                            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 px-4 py-2.5 rounded-2xl rounded-br-none max-w-[80%] animate-pulse">
                                {interimText || "..."}
                            </div>
                        </div>
                    )}

                    {/* Processing Indicator */}
                    {isProcessing && (
                         <div className="flex justify-start">
                            <div className="w-8 h-8 mr-2"></div>
                            <div className="bg-slate-100 text-slate-500 px-4 py-2 rounded-2xl rounded-bl-none text-xs flex items-center gap-2">
                                <i className="fa-solid fa-circle-notch fa-spin"></i>
                                正在思考...
                            </div>
                         </div>
                    )}
                    <div ref={chatEndRef}></div>
                </div>

                {/* Bottom Controls */}
                <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-center gap-4 flex-shrink-0 pb-8 md:pb-4">
                    <button 
                         onClick={onManualInput}
                         className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200"
                         title="切换手动输入"
                    >
                        <i className="fa-solid fa-keyboard"></i>
                    </button>
                    
                    <div className="relative">
                        {isListening && <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-30"></div>}
                        <button
                            onClick={handleMicClick}
                            className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all active:scale-95 z-10 relative
                                ${isListening ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}
                            `}
                        >
                            <i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
                        </button>
                    </div>

                    <div className="w-12"></div> {/* Spacer to center the mic */}
                </div>
            </div>
        )}
    </>
  );
};

export default VoiceInput;
