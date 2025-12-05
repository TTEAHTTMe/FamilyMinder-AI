
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
  data?: any;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ currentUser, users, onAddReminder, onManualInput, voiceSettings, aiSettings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
      { id: 0, role: 'assistant', text: '我是您的智能助手。您可以打字或点击麦克风说话。' }
  ]);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestPropsRef = useRef({ currentUser, users, aiSettings, voiceSettings });
  
  useEffect(() => {
    latestPropsRef.current = { currentUser, users, aiSettings, voiceSettings };
  }, [currentUser, users, aiSettings, voiceSettings]);

  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, interimText, isOpen]);

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
          alert("不支持语音识别。");
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
              if (result.isFinal) finalTranscript += result[0].transcript;
              else interimTranscript += result[0].transcript;
          }
          const textToShow = finalTranscript || interimTranscript;
          if (textToShow) setInterimText(textToShow);
      };

      recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
              setIsListening(false);
              alert('无法访问麦克风。');
          } else if (event.error === 'network') {
               setIsListening(false);
               alert('网络错误。');
          }
      };

      try {
          recognition.start();
          recognitionRef.current = recognition;
      } catch (e) {
          setIsListening(false);
      }
  };

  const stopListening = () => {
      stopRecognitionInstance();
      setIsListening(false);
      const textCaptured = interimText.trim();
      setInterimText(''); 
      if (textCaptured) handleUserSpeechComplete(textCaptured);
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
              throw new Error(`请先配置 API Key`);
          }

          const familyNames = allUsers.map(u => u.name);
          const todayStr = getTodayString();
          const result = await parseReminderWithGemini(
              text, curUser.name, familyNames, todayStr,
              activeConfig || curSettings.configs.gemini, curSettings.activeProvider
          );

          if (result) {
              if (result.action === 'create_reminder' && result.reminder) {
                  let targetUserId = curUser.id;
                  if (result.reminder.targetUser) {
                      const exactMatch = allUsers.find(u => u.name === result.reminder!.targetUser);
                      if (exactMatch) targetUserId = exactMatch.id;
                      else {
                          const found = allUsers.find(u => result.reminder!.targetUser!.includes(u.name));
                          if (found) targetUserId = found.id;
                      }
                  } else if (curUser.id === 'all') throw new Error("请指明是给谁的？");
                  
                  const targetUserObj = allUsers.find(u => u.id === targetUserId) || curUser;
                  const recurrence = result.reminder.recurrence || 'once';

                  onAddReminder({
                      title: result.reminder.title,
                      time: result.reminder.time,
                      date: result.reminder.date,
                      userId: targetUserId,
                      type: result.reminder.type,
                      recurrence: recurrence,
                      isCompleted: false
                  });

                  addMessage('assistant', '已添加提醒：', 'success-card', { ...result.reminder, targetUserName: targetUserObj.name, recurrence });
                  speakText("好的，已添加。");
              
              } else if (result.action === 'chat_response' && result.replyText) {
                  addMessage('assistant', result.replyText);
                  speakText(result.replyText);
              } else throw new Error("无法理解");
          } else throw new Error("AI 返回空");

      } catch (e: any) {
          addMessage('assistant', `抱歉：${e.message}`, 'error');
          speakText("出错了");
      } finally {
          setIsProcessing(false);
      }
  };

  const toggleAssistant = () => { setIsOpen(!isOpen); };

  const handleMicClick = () => {
      if (!hasSpeechSupport) {
          alert("浏览器不支持。");
          return;
      }
      if (isListening) stopListening(); else startListening();
  };

  return (
    <>
        {!isOpen && (
             <div className="fixed bottom-6 landscape:bottom-1 left-0 right-0 flex justify-center z-[100] px-4 pointer-events-none">
                <div className="w-full max-w-sm flex items-end gap-2 pointer-events-auto">
                    <button onClick={onManualInput} className="w-12 h-12 landscape:w-10 landscape:h-10 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors shadow-lg border border-slate-100 flex-shrink-0">
                        <i className="fa-solid fa-list-check text-lg landscape:text-base"></i>
                    </button>
                    <button onClick={toggleAssistant} className="h-16 landscape:h-10 flex-1 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-200 flex items-center justify-center gap-3 transition-transform active:scale-95">
                        <i className="fa-solid fa-microphone text-2xl landscape:text-base"></i>
                        <span className="font-bold text-lg landscape:hidden">AI 语音 / 对话</span>
                        <span className="font-bold text-sm hidden landscape:inline">AI 助手</span>
                    </button>
                </div>
             </div>
        )}

        {isOpen && (
            <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                {/* Modal Container: Full height on mobile landscape, centered on desktop */}
                <div className="bg-slate-100 w-full md:w-[500px] h-[90vh] landscape:h-full md:h-[700px] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up relative">
                    <div className="bg-white px-4 py-2 shadow-sm flex items-center justify-between flex-shrink-0 z-10 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><i className="fa-solid fa-robot text-sm"></i></div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm leading-tight">AI 助手</h3>
                                <p className="text-[10px] text-slate-400">{aiSettings.activeProvider}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setMessages([]); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-200"><i className="fa-solid fa-trash-can text-sm"></i></button>
                            <button onClick={toggleAssistant} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500"><i className="fa-solid fa-chevron-down text-sm"></i></button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 landscape:p-2 space-y-4">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-white text-xs mr-2 mt-1">AI</div>}
                                <div className={`w-full max-w-[90%] space-y-2`}>
                                    {msg.text && (
                                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none ml-auto w-fit' : msg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 rounded-bl-none w-fit' : 'bg-white text-slate-700 rounded-bl-none w-fit'}`}>
                                            {msg.text}
                                        </div>
                                    )}
                                    {msg.type === 'success-card' && msg.data && (
                                        <div className="w-full bg-white rounded-3xl p-3 shadow-lg border-l-8 border-green-500 overflow-hidden">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-sm font-bold text-green-600 uppercase flex items-center gap-1"><i className="fa-solid fa-circle-check"></i>添加成功</span>
                                            </div>
                                            <h4 className="font-bold text-lg text-slate-800 mb-2 leading-tight">{msg.data.title}</h4>
                                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-sm">
                                                <div className="bg-slate-50 p-2 rounded-lg"><div className="text-xs text-slate-400">时间</div><div className="font-mono font-bold text-slate-700">{msg.data.time}</div></div>
                                                <div className="bg-slate-50 p-2 rounded-lg"><div className="text-xs text-slate-400">成员</div><div className="font-bold text-slate-700 truncate">{msg.data.targetUserName}</div></div>
                                                {msg.data.recurrence && msg.data.recurrence !== 'once' && (
                                                     <div className="col-span-2 bg-purple-50 p-2 rounded-lg flex items-center gap-2 text-purple-700 font-bold text-xs">
                                                        <i className="fa-solid fa-rotate-right"></i>
                                                        {msg.data.recurrence}
                                                     </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isListening && <div className="flex justify-end"><div className="bg-blue-500/10 text-blue-700 px-3 py-2 rounded-2xl rounded-br-none animate-pulse"><span className="text-sm">{interimText || "..."}</span></div></div>}
                        {isProcessing && <div className="flex justify-start"><div className="bg-white text-slate-500 px-3 py-2 rounded-2xl rounded-bl-none text-xs flex items-center gap-2 shadow-sm"><i className="fa-solid fa-circle-notch fa-spin text-blue-500"></i>思考中...</div></div>}
                        <div ref={chatEndRef}></div>
                    </div>

                    <div className="p-2 bg-white border-t border-slate-100 flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => { toggleAssistant(); onManualInput(); }} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-200 flex-shrink-0"><i className="fa-solid fa-list-check"></i></button>
                        <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 focus-within:bg-white focus-within:border-blue-500 transition-all flex items-center px-3 h-10">
                             <input ref={inputRef} type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入..." className="w-full bg-transparent outline-none text-slate-700 text-sm" disabled={isListening || isProcessing} />
                        </div>
                        {inputText.trim() ? (
                             <button onClick={handleSendText} disabled={isProcessing} className="w-10 h-10 rounded-xl bg-blue-600 text-white shadow-sm flex items-center justify-center flex-shrink-0"><i className="fa-solid fa-paper-plane"></i></button>
                        ) : (
                             <button onClick={handleMicClick} disabled={isProcessing} className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm flex-shrink-0 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white'}`}><i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'}`}></i></button>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>
  );
};

export default VoiceInput;
