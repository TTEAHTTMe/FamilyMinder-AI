import React, { useEffect, useRef, useState } from 'react';
import { Reminder, User, VoiceSettings } from '../types';
import { ALARM_SOUND_DATA_URI } from '../constants';

interface AlarmOverlayProps {
  reminders: Reminder[];
  users: User[];
  onComplete: (id: string) => void;
  onSnooze: (id: string | null, durationMinutes: number) => void;
  voiceSettings: VoiceSettings;
}

const AlarmOverlay: React.FC<AlarmOverlayProps> = ({ reminders, users, onComplete, onSnooze, voiceSettings }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ticks, setTicks] = useState(0);
  // Track which reminder ID currently has the snooze menu open
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);
  // Track if the global "Snooze All" menu is open
  const [isGlobalSnoozeOpen, setIsGlobalSnoozeOpen] = useState(false);

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio(ALARM_SOUND_DATA_URI);
    audioRef.current.loop = true;
    
    // Try to play immediately
    const playPromise = audioRef.current.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.log("Audio autoplay prevented. Interaction needed.");
        });
    }

    return () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    };
  }, []); // Only on mount

  // Auto-Snooze Logic: If no action taken in 3 minutes, snooze all for 5 minutes
  useEffect(() => {
    const timer = setTimeout(() => {
        console.log("Auto-snoozing due to inactivity...");
        onSnooze(null, 5); // Snooze all for 5 minutes
    }, 3 * 60 * 1000); // 3 minutes

    return () => clearTimeout(timer);
  }, [onSnooze]);

  // Speech Cycle Logic
  useEffect(() => {
    const speak = () => {
      // SAFETY CHECK: If browser doesn't support speech, exit early
      if (!('speechSynthesis' in window)) return;

      // Build a combined sentence for everyone
      let combinedText = "";
      
      reminders.forEach(r => {
          const u = users.find(user => user.id === r.userId);
          const userName = u ? u.name : '家人';
          combinedText += `${userName}，时间到了，请${r.title}。`;
      });
      combinedText += "请尽快确认。";

      // Cancel current speech to prevent queue buildup during rerenders
      window.speechSynthesis.cancel();

      const msg = new SpeechSynthesisUtterance();
      msg.text = combinedText;
      msg.rate = voiceSettings.rate;
      msg.pitch = voiceSettings.pitch;
      msg.volume = voiceSettings.volume;
      msg.lang = 'zh-CN';
      
      if (voiceSettings.voiceURI) {
        const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI);
        if (voice) msg.voice = voice;
      }
      
      // Temporarily duck audio volume when speaking
      if (audioRef.current) audioRef.current.volume = 0.2;
      
      msg.onend = () => {
          if (audioRef.current) audioRef.current.volume = 1.0;
      };

      window.speechSynthesis.speak(msg);
    };

    // Speak immediately
    speak();

    // Repeat every 8 seconds (give enough time for the sentence to finish)
    const interval = setInterval(() => {
        speak();
        setTicks(t => t + 1);
    }, 8000); 

    return () => {
        clearInterval(interval);
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    };
  }, [reminders, users, voiceSettings]);

  // If no reminders left, component will be unmounted by parent, but just in case
  if (reminders.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600/90 backdrop-blur-sm animate-pulse-ring p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl transform transition-all scale-100 max-h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="text-center mb-6 flex-shrink-0">
            <div className="text-5xl mb-2 animate-bounce">⏰</div>
            <h2 className="text-3xl font-bold text-slate-800">
                {reminders.length > 1 ? `${reminders.length} 个提醒！` : '提醒时间到！'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">3分钟无操作将自动稍后</p>
        </div>

        {/* Scrollable List of Alarms */}
        <div className="space-y-4 overflow-y-auto mb-6 px-2 flex-grow scrollbar-hide">
            {reminders.map(reminder => {
                const user = users.find(u => u.id === reminder.userId);
                const isMenuOpen = snoozeMenuId === reminder.id;

                return (
                    <div key={reminder.id} className="bg-slate-50 border-2 border-red-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm relative overflow-hidden transition-all duration-300">
                         {/* Info Row */}
                        <div className="flex items-center gap-3">
                             <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${user?.color || 'bg-gray-400'} text-white flex-shrink-0`}>
                                 {user?.avatar || '👤'}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="flex justify-between items-center">
                                    <span className="font-bold text-slate-700 truncate mr-2">{user?.name || '未知成员'}</span>
                                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full uppercase whitespace-nowrap">
                                        {reminder.type === 'medication' ? '用药' : '任务'}
                                    </span>
                                 </div>
                                 <div className="text-lg font-bold text-slate-900 leading-tight mt-0.5 truncate">
                                     {reminder.title}
                                 </div>
                             </div>
                        </div>

                        {/* Action Buttons */}
                        {isMenuOpen ? (
                          <div className="grid grid-cols-4 gap-2 animate-fade-in">
                             {[5, 10, 30, 60].map(min => (
                               <button 
                                 key={min}
                                 onClick={() => onSnooze(reminder.id, min)}
                                 className="py-2 rounded-lg bg-orange-100 text-orange-700 text-sm font-bold hover:bg-orange-200"
                               >
                                 {min >= 60 ? '1时' : `${min}分`}
                               </button>
                             ))}
                             <button 
                                onClick={() => setSnoozeMenuId(null)}
                                className="col-span-4 text-xs text-slate-400 mt-1 font-bold underline"
                             >
                               取消
                             </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                                onClick={() => onComplete(reminder.id)}
                                className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-lg font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <i className="fa-solid fa-check-circle"></i>
                                完成
                            </button>
                            <button
                                onClick={() => setSnoozeMenuId(reminder.id)}
                                className="w-16 bg-orange-100 text-orange-600 hover:bg-orange-200 rounded-xl font-bold flex flex-col items-center justify-center text-xs"
                            >
                                <i className="fa-solid fa-clock mb-0.5"></i>
                                稍后
                            </button>
                          </div>
                        )}
                    </div>
                );
            })}
        </div>
        
        {/* Footer Snooze All */}
        <div className="flex-shrink-0 pt-2 border-t border-slate-100">
            {isGlobalSnoozeOpen ? (
                <div className="grid grid-cols-4 gap-2 animate-fade-in">
                    {[5, 10, 30, 60].map(min => (
                    <button 
                        key={min}
                        onClick={() => onSnooze(null, min)}
                        className="py-3 rounded-xl bg-slate-200 text-slate-700 text-base font-bold hover:bg-slate-300"
                    >
                        {min >= 60 ? '1小时' : `${min}分`}
                    </button>
                    ))}
                    <button 
                        onClick={() => setIsGlobalSnoozeOpen(false)}
                        className="col-span-4 text-xs text-slate-400 mt-2 font-bold underline"
                    >
                        取消全部稍后
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setIsGlobalSnoozeOpen(true)}
                    className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl text-lg font-medium"
                >
                    全部稍后提醒...
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default AlarmOverlay;