
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

  // Use refs to store latest props to avoid stale closures in callbacks
  const latestPropsRef = useRef({ currentUser, users, aiSettings, voiceSettings });

  useEffect(() => {
    latestPropsRef.current = { currentUser, users, aiSettings, voiceSettings };
  }, [currentUser, users, aiSettings, voiceSettings]);

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
      
      recognition.continuous = false;
      recognition.lang = 'zh-CN';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      // 3. Setup Listeners
      recognition.onstart = () => {
          setIsListening(true);
          setTranscript('');
      };

      recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                  finalTranscript += event.results[i][0].transcript;
              } else {
                  interimTranscript += event.results[i][0].transcript;
              }
          }

          const fullText = finalTranscript || interimTranscript;
          // Only update UI if we have text
          if (fullText) {
              setTranscript(fullText);
          }

          if (finalTranscript) {
              // We got the final sentence, stop listening and process
              try { recognition.stop(); } catch(e) {}
              setIsListening(false);
              handleAIProcess(finalTranscript);
          }
      };

      recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          
          // Ignore 'no-speech' and 'aborted' as they are common/benign
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
              alert("无法访问麦克风。请检查浏览器权限设置。");
          } else if (event.error === 'network') {
              alert("网络错误。请检查您的网络连接或确保 HTTPS 访问。");
          } else {
              // alert("语音识别错误: " + event.error);
          }
      };

      recognition.onend = () => {
          // Double check: if we are still "listening" in UI but it ended without final result, just reset.
          // If we are processing, don't touch state.
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
              // Should not happen with new instance strategy, but just in case
              try { recognition.stop(); } catch(z) {}
          } else {
              alert("无法启动麦克风: " + e.message);
          }
      }
  };

  const stopListening = () => {
      setIsListening(false); // Immediate UI feedback
      if (recognitionRef.current) {
          try { 
              recognitionRef.current.stop(); 
              // We rely on 'onresult' (final) or 'onend' to handle the rest
          } catch (e) {
              console.error("Stop error", e);
          }
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
    const { currentUser: curUser, users: allUsers, aiSettings: curSettings, voiceSettings: curVoice } = latestPropsRef.current;
    const curConfig = curSettings?.configs?.[curSettings?.activeProvider] || curSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

    if (!text.trim()) return;

    setIsProcessing(true);
    try {
      const familyNames = allUsers.map(u => u.name);
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
      }
    } catch (e: any) {
      console.error(e);
      alert(`AI 解析失败: ${e.message}`);
    } finally {
      setIsProcessing(false);
      setTranscript('');
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
             {(isListening || isProcessing || transcript) && (
                <div className="absolute bottom-20 right-0 bg-slate-800 text-white p-3 rounded-2xl rounded-tr-sm shadow-xl min-w-[150px] max-w-[200px] text-sm animate-fade-in z-50">
                    <div className="font-bold mb-1">
                        {isProcessing ? "🧠 思考中..." : isListening ? "👂 正在听..." : "✅ 识别结果"}
                    </div>
                    <div className="opacity-90 min-h-[1.2em]">{transcript || "..."}</div>
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
