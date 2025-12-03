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

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'zh-CN';
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        handleAIProcess(text);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
      
      // Trigger re-render to show the microphone button
      setHasSpeechSupport(true);
    } else {
      setHasSpeechSupport(false);
    }
  }, []);

  // SAFE ACCESS: Use optional chaining to prevent crash if configs are missing
  const activeConfig = aiSettings?.configs?.[aiSettings?.activeProvider] || aiSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

  const toggleListening = () => {
    // Basic check if API Key is present for the active provider (except custom)
    if (!activeConfig.apiKey && aiSettings.activeProvider !== 'custom') {
        alert(`请先在设置中配置 ${aiSettings.activeProvider || 'AI'} 的 API Key`);
        return;
    }
    
    if (!hasSpeechSupport) {
        alert("当前浏览器或环境不支持语音识别功能。\n请确保：\n1. 使用 Chrome 或 Safari 浏览器\n2. 使用 HTTPS 协议或 localhost 访问");
        return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleAIProcess = async (text: string) => {
    setIsProcessing(true);
    try {
      const familyNames = users.map(u => u.name);
      // Pass today's date so the AI knows what "tomorrow" means
      const todayStr = new Date().toISOString().split('T')[0];
      
      const result = await parseReminderWithGemini(
          text, 
          currentUser.name, 
          familyNames, 
          todayStr, 
          activeConfig, 
          aiSettings.activeProvider
      );

      if (result) {
        // Resolve user
        let targetUserId = currentUser.id;
        // Prioritize exact name match from result
        if (result.targetUser) {
           const exactMatch = users.find(u => u.name === result.targetUser);
           if (exactMatch) {
               targetUserId = exactMatch.id;
           } else {
               // Fallback to substring match
               const found = users.find(u => result.targetUser!.includes(u.name));
               if (found) targetUserId = found.id;
           }
        }

        const targetUser = users.find(u => u.id === targetUserId) || currentUser;

        onAddReminder({
          title: result.title,
          time: result.time,
          date: result.date,
          userId: targetUserId,
          type: result.type,
          isCompleted: false
        });
        
        // Audio feedback
        const msg = new SpeechSynthesisUtterance();
        msg.text = `已为${targetUser.name}添加：${result.date === todayStr ? '' : result.date} ${result.time} ${result.title}`;
        msg.lang = 'zh-CN';
        msg.rate = voiceSettings.rate;
        msg.pitch = voiceSettings.pitch;
        msg.volume = voiceSettings.volume;
        if (voiceSettings.voiceURI) {
            const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI);
            if (voice) msg.voice = voice;
        }
        window.speechSynthesis.speak(msg);
      }
    } catch (e: any) {
      console.error(e);
      alert(`AI 解析失败: ${e.message}`);
    } finally {
      setIsProcessing(false);
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
                <div className="absolute bottom-20 right-0 bg-slate-800 text-white p-3 rounded-2xl rounded-tr-sm shadow-xl min-w-[150px] max-w-[200px] text-sm animate-fade-in">
                    <div className="font-bold mb-1">
                        {isProcessing ? "🧠 思考中..." : isListening ? "👂 正在听..." : "✅ 识别结果"}
                    </div>
                    <div className="opacity-90">{transcript}</div>
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
                    <i className={`fa-solid ${isListening ? 'fa-microphone-slash' : 'fa-microphone'} text-2xl`}></i>
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