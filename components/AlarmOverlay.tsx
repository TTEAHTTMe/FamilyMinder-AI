
import React, { useEffect, useRef, useState } from 'react';
import { Reminder, User, VoiceSettings, AISettings } from '../types';
import { ALARM_SOUND_DATA_URI } from '../constants';

interface AlarmOverlayProps {
  reminders: Reminder[];
  users: User[];
  onComplete: (id: string) => void;
  onSnooze: (id: string | null, durationMinutes: number) => void;
  voiceSettings: VoiceSettings;
  aiSettings: AISettings;
}

const AlarmOverlay: React.FC<AlarmOverlayProps> = ({ reminders, users, onComplete, onSnooze, voiceSettings, aiSettings }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ticks, setTicks] = useState(0);
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);
  const [isGlobalSnoozeOpen, setIsGlobalSnoozeOpen] = useState(false);
  const [isAudioLocked, setIsAudioLocked] = useState(false);

  useEffect(() => {
    audioRef.current = new Audio(ALARM_SOUND_DATA_URI);
    audioRef.current.loop = true;
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => { 
            console.log("Audio autoplay prevented, showing unlock button."); 
            setIsAudioLocked(true);
        });
    }
    return () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    };
  }, []);

  const handleUnlockAudio = () => {
      if (audioRef.current) {
          audioRef.current.play().then(() => setIsAudioLocked(false)).catch(e => alert("无法播放声音"));
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
          // Dummy speak to unlock iOS
          const msg = new SpeechSynthesisUtterance('');
          window.speechSynthesis.speak(msg);
      }
  };

  useEffect(() => {
    const timer = setTimeout(() => { onSnooze(null, 5); }, 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [onSnooze]);

  const speakTextOpenAI = async (text: string) => {
      const ttsConfig = aiSettings.configs['openai'] || aiSettings.configs[aiSettings.activeProvider];
      const apiKey = ttsConfig?.apiKey;
      
      if (!apiKey) {
          console.warn("OpenAI TTS selected but no API Key found.");
          return false;
      }

      const rawBaseUrl = ttsConfig.baseUrl || 'https://api.openai.com/v1';
      const cleanBaseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
      const url = `${cleanBaseUrl}/audio/speech`;

      try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: voiceSettings.model || 'tts-1',
                input: text,
                voice: voiceSettings.voiceURI || 'alloy'
            })
        });
        if (!response.ok) throw new Error("TTS Failed");
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        await audio.play();
        return true;
      } catch (e) {
          console.error("OpenAI TTS Error:", e);
          return false;
      }
  };

  useEffect(() => {
    const speak = async () => {
      if (typeof window === 'undefined') return;

      let combinedText = "";
      reminders.forEach(r => {
          const u = users.find(user => user.id === r.userId);
          const userName = u ? u.name : '家人';
          combinedText += `${userName}，${r.title}。`;
      });
      
      if (voiceSettings.provider === 'openai') {
          if (audioRef.current) audioRef.current.volume = 0.2;
          const success = await speakTextOpenAI(combinedText);
          if (success) return; 
      }

      if (window.speechSynthesis && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const msg = new SpeechSynthesisUtterance();
          msg.text = combinedText;
          msg.rate = voiceSettings.rate;
          msg.pitch = voiceSettings.pitch;
          msg.volume = voiceSettings.volume;
          msg.lang = 'zh-CN';
          if (voiceSettings.voiceURI && voiceSettings.provider !== 'openai') {
            const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI);
            if (voice) msg.voice = voice;
          }
          
          if (audioRef.current) audioRef.current.volume = 0.2;
          msg.onend = () => { if (audioRef.current) audioRef.current.volume = 1.0; };
          msg.onerror = () => { if (audioRef.current) audioRef.current.volume = 1.0; };
          
          // GC FIX
          (window as any).currentUtterance = msg;
          window.speechSynthesis.speak(msg);
      }
    };

    if (!isAudioLocked) speak();
    const interval = setInterval(() => { if(!isAudioLocked) { speak(); setTicks(t => t + 1); } }, 15000); 
    return () => {
        clearInterval(interval);
        if (typeof window !== 'undefined' && window.speechSynthesis && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [reminders, users, voiceSettings, isAudioLocked]);

  if (reminders.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-red-600/90 backdrop-blur-sm animate-pulse-ring p-4 landscape:p-2">
      {isAudioLocked && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[310]">
              <button onClick={handleUnlockAudio} className="bg-white text-red-600 px-6 py-2 rounded-full font-bold shadow-lg animate-bounce">
                  🔊 点击启用声音
              </button>
          </div>
      )}
      <div className="bg-white rounded-3xl landscape:rounded-xl p-6 landscape:p-2 max-w-md landscape:max-w-2xl w-full shadow-2xl scale-100 max-h-[85vh] landscape:max-h-[95vh] flex flex-col landscape:flex-row gap-4 landscape:gap-2">
        
        {/* Header Section */}
        <div className="text-center landscape:text-left landscape:w-1/3 flex flex-col justify-center flex-shrink-0 landscape:border-r landscape:border-slate-100 landscape:pr-2">
            <div className="text-5xl landscape:text-3xl mb-2 animate-bounce">⏰</div>
            <h2 className="text-3xl landscape:text-lg font-bold text-slate-800 leading-tight">
                {reminders.length > 1 ? `${reminders.length} 个提醒` : '时间到'}
            </h2>
            <p className="text-xs text-slate-400 mt-1 mb-2">请确认</p>
            
            <div className="mt-2 landscape:mt-1">
                 {isGlobalSnoozeOpen ? (
                    <div className="grid grid-cols-2 gap-1 animate-fade-in">
                        {[5, 10, 30, 60].map(min => (
                        <button key={min} onClick={() => onSnooze(null, min)} className="py-2 landscape:py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-300">
                            {min}分
                        </button>
                        ))}
                        <button onClick={() => setIsGlobalSnoozeOpen(false)} className="col-span-2 text-xs text-slate-400 mt-1 underline">取消</button>
                    </div>
                ) : (
                    <button onClick={() => setIsGlobalSnoozeOpen(true)} className="w-full py-3 landscape:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-lg landscape:text-sm font-bold">
                        全部稍后
                    </button>
                )}
            </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto landscape:w-2/3 px-1 scrollbar-hide space-y-3 landscape:space-y-2">
            {reminders.map(reminder => {
                const user = users.find(u => u.id === reminder.userId);
                const isMenuOpen = snoozeMenuId === reminder.id;

                return (
                    <div key={reminder.id} className="bg-slate-50 border-2 border-red-100 rounded-2xl landscape:rounded-lg p-4 landscape:p-2 flex flex-col gap-3 landscape:gap-1 shadow-sm relative">
                        <div className="flex items-center gap-3 landscape:gap-2">
                             <div className={`w-12 h-12 landscape:w-8 landscape:h-8 rounded-full flex items-center justify-center text-2xl landscape:text-sm ${user?.color || 'bg-gray-400'} text-white flex-shrink-0`}>
                                 {user?.avatar || '👤'}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-700 landscape:text-xs truncate mr-2">{user?.name || '未知'}</span>
                                    <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full uppercase whitespace-nowrap">
                                        待办
                                    </span>
                                 </div>
                                 <div className="text-lg landscape:text-sm font-bold text-slate-900 leading-tight mt-0.5 truncate">
                                     {reminder.title}
                                 </div>
                             </div>
                        </div>

                        {isMenuOpen ? (
                          <div className="grid grid-cols-4 gap-1">
                             {[5, 10, 30, 60].map(min => (
                               <button key={min} onClick={() => onSnooze(reminder.id, min)} className="py-1 rounded bg-orange-100 text-orange-700 text-xs font-bold hover:bg-orange-200">
                                 {min}m
                               </button>
                             ))}
                             <button onClick={() => setSnoozeMenuId(null)} className="col-span-4 text-xs text-slate-400 font-bold underline">取消</button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => onComplete(reminder.id)} className="flex-1 py-3 landscape:py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-xl landscape:rounded-lg text-lg landscape:text-xs font-bold shadow-md active:scale-95 flex items-center justify-center gap-2">
                                <i className="fa-solid fa-check-circle"></i> 完成
                            </button>
                            <button onClick={() => setSnoozeMenuId(reminder.id)} className="w-16 landscape:w-10 bg-orange-100 text-orange-600 hover:bg-orange-200 rounded-xl landscape:rounded-lg font-bold flex flex-col items-center justify-center text-xs">
                                <i className="fa-solid fa-clock mb-0.5 landscape:hidden"></i> 稍后
                            </button>
                          </div>
                        )}
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default AlarmOverlay;
