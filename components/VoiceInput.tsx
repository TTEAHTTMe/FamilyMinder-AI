import React, { useState, useEffect, useRef } from 'react';
import { parseReminderWithGemini } from '../services/geminiService';
import { User, VoiceSettings, AISettings } from '../types';

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
  const recognitionRef = useRef<any>(null);

  // Use refs to store latest props to avoid stale closures in callbacks
  const latestPropsRef = useRef({ currentUser, users, aiSettings, voiceSettings });

  useEffect(() => {
    latestPropsRef.current = { currentUser, users, aiSettings, voiceSettings };
  }, [currentUser, users, aiSettings, voiceSettings]);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // We want it to stop after one sentence usually
        recognition.lang = 'zh-CN';
        recognition.interimResults = true; // IMPORTANT: Enable real-time feedback

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

            // Show whatever we have
            const fullText = finalTranscript || interimTranscript;
            setTranscript(fullText);

            // If we have a final result, process it
            if (finalTranscript) {
                // Force stop purely for state consistency
                setIsListening(false);
                handleAIProcess(finalTranscript);
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
            
            // Map common errors to user-friendly alerts
            if (event.error === 'not-allowed') {
                alert("无法访问麦克风。请检查浏览器权限设置。");
            } else if (event.error === 'network') {
                alert("网络错误。请检查您的网络连接或确保 HTTPS 访问。");
            } else if (event.error === 'no-speech') {
                // Just silent reset, maybe user didn't say anything
                setTranscript('');
            } else if (event.error === 'aborted') {
                // User stopped it, fine.
            } else {
                // Other errors
                // alert("语音识别错误: " + event.error);
            }
        };

        recognition.onend = () => {
            setIsListening(false);
        };
        
        recognitionRef.current = recognition;
        setHasSpeechSupport(true);
      } catch (e) {
        console.error("Speech init error", e);
        setHasSpeechSupport(false);
      }
    } else {
      setHasSpeechSupport(false);
    }
  }, []);

  // SAFE ACCESS
  const activeConfig = aiSettings?.configs?.[aiSettings?.activeProvider] || aiSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

  const toggleListening = () => {
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    // 1. Check Key
    if (!activeConfig.apiKey && aiSettings?.activeProvider !== 'custom') {
        alert(`请先在设置中配置 ${aiSettings?.activeProvider || 'AI'} 的 API Key`);
        return;
    }
    
    // 2. Check Browser Support
    if (!hasSpeechSupport || !recognitionRef.current) {
        alert("当前浏览器或环境不支持语音识别功能。\n请确保：\n1. 使用 Chrome 或 Safari 浏览器\n2. 使用 HTTPS 协议或 localhost 访问");
        return;
    }

    if (isListening) {
      // STOPPING
      setIsListening(false); // Force update UI immediately
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Stop error", e);
      }
    } else {
      // STARTING
      setTranscript('');
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e: any) {
          console.error("Failed to start speech", e);
          setIsListening(false);
          alert("无法启动麦克风: " + e.message);
      }
    }
  };

  const handleAIProcess = async (text: string) => {
    // Retrieve fresh data from ref to avoid stale closures
    const { currentUser: curUser, users: allUsers, aiSettings: curSettings, voiceSettings: curVoice } = latestPropsRef.current;
    const curConfig = curSettings?.configs?.[curSettings?.activeProvider] || curSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

    if (!text.trim()) return;

    setIsProcessing(true);
    try {
      const familyNames = allUsers.map(u => u.name);
      // Pass today's date so the AI knows what "tomorrow" means
      const todayStr = new Date().toISOString().split('T')[0];
      
      const result = await parseReminderWithGemini(
          text, 
          curUser.name, 
          familyNames, 
          todayStr, 
          curConfig, 
          curSettings.activeProvider
      );

      if (result) {
        // Resolve user
        let targetUserId = curUser.id;
        // Prioritize exact name match from result
        if (result.targetUser) {
           const exactMatch = allUsers.find(u => u.name === result.targetUser);
           if (exactMatch) {
               targetUserId = exactMatch.id;
           } else {
               // Fallback to substring match
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
        
        // Audio feedback (SAFE CHECK)
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            // Cancel current speaking to speak new message immediately
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
      setTranscript(''); // Clear transcript after processing
    }
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4 pointer-events-none">
      <div className="w-full max-w-sm flex items-end gap-3 pointer-events-auto">
        
        {/* Manual Input Button (Pill) */}
        <button 
            onClick={onManualInput}
            className="flex-1 bg-white hover:bg-slate-50 text-slate-700 h-16 rounded-2xl shadow-xl border border-slate-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
        >
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <i className="fa-solid fa-keyboard"></i>
            </div>
            <span className="font-bold text-lg">手动添加</span>
        </button>

        {/* AI Voice Button (Circle) */}
        <div className="relative">
             {/* Speech Status Bubble */}
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
             
             {/* Ripple effect when listening */}
             {isListening && (
                <div className="absolute inset-0 bg-red-500 rounded-2xl animate-ping opacity-30"></div>
             )}
        </div>

      </div>
    </div>
  );
};

export default VoiceInput;