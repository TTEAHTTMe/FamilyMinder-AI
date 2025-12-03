
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
  const [inputText, setInputText] = useState(''); // Text currently being typed
  const [messages, setMessages] = useState<ChatMessage[]>([
      { id: 0, role: 'assistant', text: '我是您的家庭智能助手。您可以直接打字，或点击麦克风说话。\n例如：“明天早上8点提醒爷爷吃药”' }
  ]);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
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
      
      if (!SpeechRecognition) {
          alert("您的浏览器不支持语音识别 API。");
          return;
      }

      const recognition = new SpeechRecognition();
      
      recognition.continuous = true; 
      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
          setIsListening(true);
          setInterimText('');
          if (navigator.vibrate) navigator.vibrate(50);
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
          const textToShow = finalTranscript || interimTranscript;
          if (textToShow) setInterimText(textToShow);
      };

      recognition.onerror = (event: any) => {
          console.error("Speech Error:", event.error);
          if (event.error === 'not-allowed') {
              setIsListening(false);
              alert('无法访问麦克风，请检查权限。');
          } else if (event.error === 'network') {
               setIsListening(false);
               alert('网络连接异常，无法进行语音识别。');
          }
      };

      recognition.onend = () => {
          // Controlled manually
      };

      try {
          recognition.start();
          recognitionRef.current = recognition;
      } catch (e) {
          console.error(e);
          setIsListening(false);
          try {
              stopRecognitionInstance();
              setTimeout(() => {
                 try {
                     const retryRec = new SpeechRecognition();
                     retryRec.lang = 'zh-CN';
                     retryRec.start();
                     recognitionRef.current = retryRec;
                     setIsListening(true);
                 } catch(err) {}
              }, 100);
          } catch (retryErr) {
              alert("无法启动麦克风，请刷新页面重试。");
          }
      }
  };

  const stopListening = () => {
      stopRecognitionInstance();
      setIsListening(false);
      
      const textCaptured = interimText.trim();
      setInterimText(''); 

      if (textCaptured) {
          handleUserSpeechComplete(textCaptured);
      } else {
          addMessage('assistant', '🔇 抱歉，我没有听到声音。\n可能是网络原因或麦克风未收音。', 'error');
      }
  };

  const handleSendText = () => {
      if (!inputText.trim()) return;
      handleUserSpeechComplete(inputText.trim());
      setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendText();
      }
  };

  const speakText = (text: string) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance();
        msg.text = text;
        msg.lang = 'zh-CN';
        const { voiceSettings: curVoice } = latestPropsRef.current;
        if (curVoice.voiceURI) {
            const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === curVoice.voiceURI);
            if (voice) msg.voice = voice;
        }
        window.speechSynthesis.speak(msg);
    }
  };

  const handleUserSpeechComplete = async (text: string) => {
      if (!text.trim()) return;
      
      addMessage('user', text);
      setIsProcessing(true);
      
      try {
          const { currentUser: curUser, users: allUsers, aiSettings: curSettings } = latestPropsRef.current;
          
          const activeConfig = curSettings.configs?.[curSettings.activeProvider];
          if (!activeConfig?.apiKey && curSettings.activeProvider !== 'custom') {
              throw new Error(`请先配置 ${curSettings.activeProvider} 的 API Key`);
          }

          const familyNames = allUsers.map(u => u.name);
          const todayStr = getTodayString();

          console.log("Sending to AI...", text);

          const result = await parseReminderWithGemini(
              text,
              curUser.name,
              familyNames,
              todayStr,
              activeConfig || curSettings.configs.gemini,
              curSettings.activeProvider
          );

          if (result) {
              // --- SCENARIO 1: CREATE REMINDER ---
              if (result.action === 'create_reminder' && result.reminder) {
                  let targetUserId = curUser.id;
                  
                  // Logic to map string name to ID
                  if (result.reminder.targetUser) {
                      const exactMatch = allUsers.find(u => u.name === result.reminder!.targetUser);
                      if (exactMatch) targetUserId = exactMatch.id;
                      else {
                          const found = allUsers.find(u => result.reminder!.targetUser!.includes(u.name));
                          if (found) targetUserId = found.id;
                      }
                  } else if (curUser.id === 'all') {
                      // Should be handled by AI prompt, but fallback just in case
                      throw new Error("请指明这个提醒是给谁的？");
                  }
                  
                  const targetUserObj = allUsers.find(u => u.id === targetUserId) || curUser;

                  onAddReminder({
                      title: result.reminder.title,
                      time: result.reminder.time,
                      date: result.reminder.date,
                      userId: targetUserId,
                      type: result.reminder.type,
                      isCompleted: false
                  });

                  addMessage('assistant', '已为您添加提醒：', 'success-card', { ...result.reminder, targetUserName: targetUserObj.name });
                  speakText("好的，已添加提醒。");
              
              } 
              // --- SCENARIO 2: CHAT RESPONSE ---
              else if (result.action === 'chat_response' && result.replyText) {
                  addMessage('assistant', result.replyText);
                  speakText(result.replyText);
              } else {
                   throw new Error("AI 返回了无法理解的数据");
              }

          } else {
              throw new Error("AI 返回了空内容，请重试");
          }

      } catch (e: any) {
          console.error("AI Process Error:", e);
          addMessage('assistant', `抱歉：${e.message}`, 'error');
          speakText(`抱歉，${e.message}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const toggleAssistant = () => {
      setIsOpen(!isOpen);
  };

  const handleMicClick = () => {
      if (!hasSpeechSupport) {
          alert("当前环境不支持语音识别，请使用 Chrome 或 Safari，并确保是 HTTPS 连接。");
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
        {!isOpen && (
             <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
                <div className="w-full max-w-sm flex items-end gap-3 pointer-events-auto">
                    <button 
                        onClick={onManualInput}
                        className="flex-1 bg-white hover:bg-slate-50 text-slate-700 h-16 rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
                    >
                        <i className="fa-solid fa-pen-to-square text-xl"></i>
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

        {isOpen && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-slate-100 w-full md:w-[500px] h-[90vh] md:h-[700px] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up relative">
                    
                    {/* Header */}
                    <div className="bg-white px-4 py-3 shadow-sm flex items-center justify-between flex-shrink-0 z-10 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <i className="fa-solid fa-robot text-sm"></i>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm leading-tight">AI 助手</h3>
                                <p className="text-[10px] text-slate-400">Powered by {aiSettings.activeProvider}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => { 
                                    setMessages([{ id: Date.now(), role: 'assistant', text: '已清空上下文，请重新开始。' }]);
                                }}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-200 transition-colors"
                            >
                                <i className="fa-solid fa-trash-can text-sm"></i>
                            </button>
                            <button 
                                onClick={toggleAssistant} 
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                                <i className="fa-solid fa-chevron-down text-sm"></i>
                            </button>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-white text-xs mr-2 mt-1">
                                        AI
                                    </div>
                                )}

                                <div className={`max-w-[85%] space-y-2`}>
                                    {msg.text && (
                                        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm
                                            ${msg.role === 'user' 
                                                ? 'bg-blue-600 text-white rounded-br-none' 
                                                : msg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 rounded-bl-none' : 'bg-white text-slate-700 rounded-bl-none'}
                                        `}>
                                            {msg.text}
                                        </div>
                                    )}

                                    {msg.type === 'success-card' && msg.data && (
                                        <div className="bg-white rounded-2xl p-4 shadow-md border-l-4 border-green-500 overflow-hidden animate-scale-in">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs font-bold text-green-600 uppercase tracking-wide">
                                                    <i className="fa-solid fa-check-circle mr-1"></i>
                                                    提醒已创建
                                                </span>
                                            </div>
                                            <h4 className="font-bold text-lg text-slate-800 mb-2">{msg.data.title}</h4>
                                            <div className="text-sm text-slate-600 flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <i className="fa-regular fa-clock text-slate-400 w-4 text-center"></i> 
                                                    <span className="font-mono font-bold text-slate-700">{msg.data.time}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <i className="fa-regular fa-calendar text-slate-400 w-4 text-center"></i>
                                                    <span>{msg.data.date}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <i className="fa-solid fa-user text-slate-400 w-4 text-center"></i>
                                                    <span className="bg-slate-100 px-2 rounded text-xs py-0.5">{msg.data.targetUserName}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        {isListening && (
                            <div className="flex justify-end">
                                <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 px-4 py-3 rounded-2xl rounded-br-none max-w-[85%] animate-pulse">
                                    <span className="text-sm font-medium">{interimText || "正在听..."}</span>
                                </div>
                            </div>
                        )}

                        {isProcessing && (
                             <div className="flex justify-start">
                                <div className="w-8 h-8 mr-2"></div>
                                <div className="bg-white text-slate-500 px-4 py-3 rounded-2xl rounded-bl-none text-xs flex items-center gap-2 shadow-sm">
                                    <i className="fa-solid fa-circle-notch fa-spin text-blue-500"></i>
                                    正在思考...
                                </div>
                             </div>
                        )}
                        <div ref={chatEndRef}></div>
                    </div>

                    {/* Bottom Input Area */}
                    <div className="p-3 bg-white border-t border-slate-100 flex items-end gap-3 flex-shrink-0 pb-8 md:pb-6">
                        <button 
                             onClick={() => { toggleAssistant(); onManualInput(); }}
                             className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0"
                        >
                            <i className="fa-solid fa-list-check text-lg"></i>
                        </button>
                        
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-200 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all flex items-center px-4 min-h-[48px] py-2">
                             <input
                                ref={inputRef}
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="输入文字或点击麦克风..."
                                className="w-full bg-transparent outline-none text-slate-700 text-base"
                                disabled={isListening || isProcessing}
                             />
                        </div>

                        {inputText.trim() ? (
                             <button
                                onClick={handleSendText}
                                disabled={isProcessing}
                                className="w-12 h-12 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 flex items-center justify-center transition-transform active:scale-95 flex-shrink-0"
                             >
                                <i className="fa-solid fa-paper-plane text-lg"></i>
                             </button>
                        ) : (
                             <button
                                onClick={handleMicClick}
                                disabled={isProcessing}
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg transition-all active:scale-95 flex-shrink-0
                                    ${isListening ? 'bg-red-500 text-white shadow-red-200 animate-pulse' : 'bg-blue-600 text-white shadow-blue-200'}
                                `}
                             >
                                <i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i>
                             </button>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

export default VoiceInput;
