
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

const VoiceInput: React.FC<VoiceInputProps> = ({ currentUser, users, onAddReminder, onManualInput, voiceSettings, aiSettings }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  
  // We store the active recognition instance here
  const recognitionRef = useRef<any>(null);
  // Keep track of the transcript in a ref for immediate access during event callbacks/stop
  const transcriptRef = useRef('');

  // Use refs to store latest props to avoid stale closures in callbacks
  const latestPropsRef = useRef({ currentUser, users, aiSettings, voiceSettings });

  useEffect(() => {
    latestPropsRef.current = { currentUser, users, aiSettings, voiceSettings };
  }, [currentUser, users, aiSettings, voiceSettings]);

  // Sync transcript state to ref
  useEffect(() => {
      transcriptRef.current = transcript;
  }, [transcript]);

  // Check support on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setHasSpeechSupport(true);
    } else {
      setHasSpeechSupport(false);
    }
    
    // Cleanup on unmount
    return () => {
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e) {}
        }
    };
  }, []);

  const activeConfig = aiSettings?.configs?.[aiSettings?.activeProvider] || aiSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

  const startListening = () => {
      // 1. Cleanup old instance if exists
      if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch(e) {}
          recognitionRef.current = null;
      }

      // 2. Create NEW instance
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false; // Mobile prefers false for short commands
      recognition.lang = 'zh-CN';
      recognition.interimResults = true; // CRITICAL: Allows seeing words as they are spoken
      recognition.maxAlternatives = 1;

      // 3. Setup Listeners
      recognition.onstart = () => {
          setIsListening(true);
          setTranscript('');
          transcriptRef.current = '';
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

          // Force UI update immediately with whatever we have
          const displayDetails = finalTranscript || interimTranscript;
          if (displayDetails) {
              setTranscript(displayDetails);
          }

          if (finalTranscript) {
              // We got the final sentence
              // Stop recognition to prevent duplicates, but logic continues in handleAIProcess
              try { recognition.stop(); } catch(e) {}
              setIsListening(false);
              handleAIProcess(finalTranscript);
          }
      };

      recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          
          if (event.error === 'no-speech') {
              setIsListening(false);
              return;
          }
          if (event.error === 'aborted') {
              setIsListening(false);
              return;
          }

          setIsListening(false);
          
          if (event.error === 'not-allowed') {
              alert("无法访问麦克风。请检查浏览器权限设置 (需 HTTPS)。");
          } else if (event.error === 'network') {
              alert("网络错误。请检查您的网络连接。");
          }
      };

      recognition.onend = () => {
          // Only turn off listening flag. 
          // Do NOT clear transcript here, so user can see it while processing.
          if (!isProcessing) {
             setIsListening(false);
          }
      };

      // 4. Start
      try {
          recognition.start();
          recognitionRef.current = recognition;
      } catch (e: any) {
          console.error("Start error", e);
          setIsListening(false);
          if (e.message && e.message.includes('already started')) {
              try { recognition.stop(); } catch(z) {}
          } else {
              alert("无法启动麦克风: " + e.message);
          }
      }
  };

  const stopListening = () => {
      // Immediate UI feedback
      setIsListening(false); 
      
      if (recognitionRef.current) {
          try { 
              recognitionRef.current.stop(); 
          } catch (e) {
              console.error("Stop error", e);
          }
      }

      // CRITICAL FIX: Manually trigger AI with whatever text we have captured so far.
      // Do not wait for 'onend' or 'isFinal', as mobile browsers are flaky with those.
      const currentText = transcriptRef.current;
      if (currentText && !isProcessing) {
          handleAIProcess(currentText);
      }
  };

  const toggleListening = () => {
    // Haptic
    if (navigator.vibrate) navigator.vibrate(50);

    // Checks
    if (!activeConfig.apiKey && aiSettings?.activeProvider !== 'custom') {
        alert(`请先在设置中配置 ${aiSettings?.activeProvider || 'AI'} 的 API Key`);
        return;
    }
    
    if (!hasSpeechSupport) {
        alert("当前浏览器不支持语音识别。\n建议使用 Chrome, Safari, Edge 浏览器。");
        return;
    }

    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
  };

  const handleAIProcess = async (text: string) => {
    // Prevent double submission
    if (isProcessing) return;
    if (!text.trim()) return;

    setIsProcessing(true);
    
    // NOTE: We do NOT clear transcript here. We keep it visible so user sees what is being processed.

    try {
      const { currentUser: curUser, users: allUsers, aiSettings: curSettings, voiceSettings: curVoice } = latestPropsRef.current;
      const curConfig = curSettings?.configs?.[curSettings?.activeProvider] || curSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

      const familyNames = allUsers.map(u => u.name);
      // Use local date for relative date calculation
      const todayStr = getTodayString();
      
      const result = await parseReminderWithGemini(
          text, 
          curUser.name, 
          familyNames, 
          todayStr, 
          curConfig, 
          curSettings.activeProvider
      );

      if (result) {
        let targetUserId = curUser.id;
        if (result.targetUser) {
           const exactMatch = allUsers.find(u => u.name === result.targetUser);
           if (exactMatch) {
               targetUserId = exactMatch.id;
           } else {
               const found = allUsers.find(u => result.targetUser!.includes(u.name));
               if (found) targetUserId = found.id;
           }
        }

        const targetUser = allUsers.find(u => u.id === targetUserId) || curUser;

        onAddReminder({
          title: result.title,
          time: result.time,
          date: result.date,
          userId: targetUserId,
          type: result.type,
          isCompleted: false
        });
        
        // Clear transcript only on success
        setTranscript('');

        // Audio feedback
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance();
            msg.text = `已为${targetUser.name}添加：${result.date === todayStr ? '' : result.date} ${result.time} ${result.title}`;
            msg.lang = 'zh-CN';
            msg.rate = curVoice.rate;
            msg.pitch = curVoice.pitch;
            msg.volume = curVoice.volume;
            if (curVoice.voiceURI) {
                const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === curVoice.voiceURI);
                if (voice) msg.voice = voice;
            }
            window.speechSynthesis.speak(msg);
        }
      } else {
          throw new Error("AI 返回了空结果");
      }
    } catch (e: any) {
      console.error("AI Logic Failed:", e);
      alert(`AI 解析失败: ${e.message}\n请检查 API Key 或网络连接。`);
      // On error, we keep the transcript so user can try again or see what failed
    } finally {
      setIsProcessing(false);
      // If success, transcript is already cleared. If failed, it remains.
      // If we want to auto-clear on error after a while, we could do it here, but keeping it is better.
      // For now, let's allow user to try again, but maybe we should clear if it was successful.
      // Actually, let's clear it in the 'catch' block? No, keep it.
      // Let's clear it if processing is done successfully (logic above).
    }
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
      <div className="w-full max-w-sm flex items-end gap-3 pointer-events-auto">
        
        {/* Manual Input Button */}
        <button 
            onClick={onManualInput}
            className="flex-1 bg-white hover:bg-slate-50 text-slate-700 h-16 rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
        >
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <i className="fa-solid fa-keyboard"></i>
            </div>
            <span className="font-bold text-lg">手动添加</span>
        </button>

        {/* AI Voice Button */}
        <div className="relative">
             {/* Dynamic Speech Bubble */}
             {(isListening || isProcessing || transcript) && (
                <div className="absolute bottom-20 right-0 bg-slate-800 text-white p-4 rounded-3xl rounded-br-sm shadow-2xl min-w-[200px] max-w-[280px] animate-fade-in z-50 flex flex-col justify-center min-h-[80px]">
                    {/* Content Display */}
                    {transcript ? (
                        <div className="mb-2">
                             <div className="text-lg font-medium leading-snug break-words">
                                "{transcript}"
                            </div>
                        </div>
                    ) : isListening ? (
                         // Listening visualization when no text yet
                         <div className="flex flex-col items-center gap-2 py-1">
                            <div className="flex gap-1 h-6 items-center">
                                <div className="w-1.5 h-3 bg-red-400 rounded-full animate-[pulse_0.5s_ease-in-out_infinite]"></div>
                                <div className="w-1.5 h-5 bg-red-400 rounded-full animate-[pulse_0.5s_ease-in-out_0.1s_infinite]"></div>
                                <div className="w-1.5 h-8 bg-red-400 rounded-full animate-[pulse_0.5s_ease-in-out_0.2s_infinite]"></div>
                                <div className="w-1.5 h-5 bg-red-400 rounded-full animate-[pulse_0.5s_ease-in-out_0.3s_infinite]"></div>
                                <div className="w-1.5 h-3 bg-red-400 rounded-full animate-[pulse_0.5s_ease-in-out_0.4s_infinite]"></div>
                            </div>
                            <span className="text-sm font-bold text-slate-300">正在听...</span>
                        </div>
                    ) : null}

                    {/* Status Footer */}
                    {isProcessing && (
                         <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm border-t border-slate-700 pt-2 mt-1">
                             <i className="fa-solid fa-brain fa-bounce"></i>
                             <span>AI 正在思考...</span>
                        </div>
                    )}
                </div>
             )}

             <button
                onClick={toggleListening}
                disabled={isProcessing}
                className={`h-16 w-16 rounded-2xl shadow-xl flex items-center justify-center text-white transition-all duration-300 z-10 relative
                    ${!hasSpeechSupport ? 'bg-slate-300' : isListening ? 'bg-red-500 scale-110 shadow-red-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}
                `}
                title={!hasSpeechSupport ? "当前环境不支持语音" : "语音添加"}
            >
                {isProcessing ? (
                    <i className="fa-solid fa-spinner fa-spin text-2xl"></i>
                ) : (
                    <i className={`fa-solid ${isListening ? 'fa-stop' : 'fa-microphone'} text-2xl`}></i>
                )}
            </button>
             
             {isListening && (
                <div className="absolute inset-0 bg-red-500 rounded-2xl animate-ping opacity-30"></div>
             )}
        </div>

      </div>
    </div>
  );
};

export default VoiceInput;
