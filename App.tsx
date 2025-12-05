import React, { useState, useEffect, useRef, ErrorInfo, ReactNode } from 'react';
import { MOCK_USERS, INITIAL_REMINDERS, getTodayString, DEFAULT_REMINDER_TYPES } from './constants';
import { User, Reminder, VoiceSettings, AISettings, AIProvider, CloudSettings, ReminderTypeDefinition } from './types';
import VoiceInput from './components/VoiceInput';
import AlarmOverlay from './components/AlarmOverlay';
import ManualInputModal from './components/ManualInputModal';
import SettingsModal from './components/SettingsModal';
import CalendarView from './components/CalendarView';
import { updateCloudBackup } from './services/cloudService';
import { v4 as uuidv4 } from 'uuid';

// --- Error Boundary Component ---
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-red-50 text-red-900 text-center">
          <h1 className="text-3xl font-bold mb-4">哎呀，出错了 😵</h1>
          <p className="mb-4 text-lg">应用程序遇到了一些问题。</p>
          <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm mb-6 max-w-md overflow-auto text-left text-sm font-mono">
            {this.state.error?.toString()}
          </div>
          <button 
            onClick={this.handleReset}
            className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
          >
            重置所有数据并刷新
          </button>
          <p className="mt-4 text-sm opacity-60">点击重置将清除本地缓存并恢复出厂设置。</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Helper to extract color name from Tailwind class (e.g. "bg-blue-500" -> "blue")
const getColorName = (bgClass: string) => {
    return bgClass.replace('bg-', '').replace('-500', '');
};

type ViewMode = 'home' | 'user' | 'calendar';

// --- Internal Confirmation Modal Component ---
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}
const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in border border-slate-100">
        <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 shadow-lg shadow-red-200 transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  // --- State Initialization ---
  const [users, setUsers] = useState<User[]>(() => {
    try {
        const saved = localStorage.getItem('family_users');
        return saved ? JSON.parse(saved) : MOCK_USERS;
    } catch { return MOCK_USERS; }
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
        const saved = localStorage.getItem('family_users');
        const loadedUsers = saved ? JSON.parse(saved) : MOCK_USERS;
        return loadedUsers[0] || MOCK_USERS[0];
    } catch { return MOCK_USERS[0]; }
  });

  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
      return getTodayString();
  });

  const [reminderTypes, setReminderTypes] = useState<ReminderTypeDefinition[]>(() => {
      try {
          const saved = localStorage.getItem('family_reminder_types');
          return saved ? JSON.parse(saved) : DEFAULT_REMINDER_TYPES;
      } catch { return DEFAULT_REMINDER_TYPES; }
  });

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    try {
        const saved = localStorage.getItem('family_reminders');
        let loaded = saved ? JSON.parse(saved) : INITIAL_REMINDERS;
        const today = getTodayString();
        if (Array.isArray(loaded)) {
            loaded = loaded.map((r: any) => ({
                ...r,
                date: r.date || today,
                recurrence: r.recurrence || 'once'
            }));
            return loaded;
        }
        return INITIAL_REMINDERS;
    } catch { return INITIAL_REMINDERS; }
  });

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    try {
        const saved = localStorage.getItem('family_voice_settings');
        return saved ? JSON.parse(saved) : { provider: 'web', voiceURI: '', pitch: 1.0, rate: 1.0, volume: 1.0, model: 'tts-1' };
    } catch { return { provider: 'web', voiceURI: '', pitch: 1.0, rate: 1.0, volume: 1.0, model: 'tts-1' }; }
  });

  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const defaultSettings: AISettings = { 
        activeProvider: 'gemini',
        configs: {
            gemini: { apiKey: '', baseUrl: '', model: 'gemini-2.5-flash' },
            deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
            moonshot: { apiKey: '', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
            siliconflow: { apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
            openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' },
            custom: { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'llama3' }
        }
    };

    try {
        const saved = localStorage.getItem('family_ai_settings');
        if (!saved) return defaultSettings;
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object') return defaultSettings;
        const safeConfigs = { ...defaultSettings.configs };
        if (parsed.configs && typeof parsed.configs === 'object') {
             const providerKeys = Object.keys(defaultSettings.configs) as AIProvider[];
             providerKeys.forEach(key => {
                 if (parsed.configs[key]) {
                     safeConfigs[key] = { ...defaultSettings.configs[key], ...parsed.configs[key] };
                 }
             });
        }
        let active = parsed.activeProvider;
        if (!active || !safeConfigs[active as AIProvider]) active = 'gemini';
        return { activeProvider: active, configs: safeConfigs };
    } catch (e) {
        return defaultSettings;
    }
  });

  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => {
      try {
          const saved = localStorage.getItem('family_cloud_settings');
          const parsed = saved ? JSON.parse(saved) : {};
          return {
              apiKey: parsed.apiKey || '',
              binId: parsed.binId || '',
              autoSyncEnabled: parsed.autoSyncEnabled || false,
              autoSyncInterval: parsed.autoSyncInterval || 60,
              lastAutoSync: parsed.lastAutoSync || 0
          };
      } catch { return { apiKey: '', binId: '', autoSyncEnabled: false, autoSyncInterval: 60, lastAutoSync: 0 }; }
  });

  const [activeReminders, setActiveReminders] = useState<Reminder[]>([]);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('family');
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const audioUnlockedRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const systemTodayRef = useRef(selectedDate);
  const latestDataRef = useRef({ users, reminders, voiceSettings, aiSettings, cloudSettings, reminderTypes });

  useEffect(() => {
    if (!users.find(u => u.id === currentUser.id)) {
      if (users.length > 0) setCurrentUser(users[0]);
    }
  }, [users, currentUser]);

  useEffect(() => {
      latestDataRef.current = { users, reminders, voiceSettings, aiSettings, cloudSettings, reminderTypes };
  }, [users, reminders, voiceSettings, aiSettings, cloudSettings, reminderTypes]);

  useEffect(() => {
      const interval = setInterval(() => {
          const currentSystemDate = getTodayString();
          if (currentSystemDate !== systemTodayRef.current) {
               systemTodayRef.current = currentSystemDate;
               setSelectedDate(prev => {
                   if (prev < currentSystemDate) return currentSystemDate;
                   return prev;
               });
          }
      }, 1000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      const interval = setInterval(() => {
          const { cloudSettings: cs, users: u, reminders: r, voiceSettings: vs, aiSettings: ai, reminderTypes: rt } = latestDataRef.current;
          if (cs.autoSyncEnabled && cs.apiKey && cs.binId) {
              const now = Date.now();
              const lastSync = cs.lastAutoSync || 0;
              const intervalMs = cs.autoSyncInterval * 60 * 1000;
              
              if (now - lastSync > intervalMs) {
                  const data = { users: u, reminders: r, voiceSettings: vs, aiSettings: ai, reminderTypes: rt, version: "1.1", lastUpdated: new Date().toISOString() };
                  updateCloudBackup(cs.apiKey, cs.binId, data).then(() => {
                      setCloudSettings({ ...cs, lastAutoSync: now });
                  }).catch(err => console.error("Auto Sync Failed", err));
              }
          }
      }, 60000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('family_users', JSON.stringify(users));
    localStorage.setItem('family_auto_backup', JSON.stringify({
        users, reminders, voiceSettings, aiSettings, reminderTypes, backupTime: new Date().toISOString()
    }));
  }, [users, reminders, voiceSettings, aiSettings, reminderTypes]);

  useEffect(() => { localStorage.setItem('family_reminders', JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => { localStorage.setItem('family_voice_settings', JSON.stringify(voiceSettings)); }, [voiceSettings]);
  useEffect(() => { localStorage.setItem('family_ai_settings', JSON.stringify(aiSettings)); }, [aiSettings]);
  useEffect(() => { localStorage.setItem('family_cloud_settings', JSON.stringify(cloudSettings)); }, [cloudSettings]);
  useEffect(() => { localStorage.setItem('family_reminder_types', JSON.stringify(reminderTypes)); }, [reminderTypes]);

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (viewMode !== 'home') {
      inactivityTimerRef.current = setTimeout(() => {
        setViewMode('home');
      }, 180000); 
    }
  };

  useEffect(() => {
    window.addEventListener('click', resetInactivityTimer);
    window.addEventListener('touchstart', resetInactivityTimer);
    window.addEventListener('keydown', resetInactivityTimer);
    return () => {
      window.removeEventListener('click', resetInactivityTimer);
      window.removeEventListener('touchstart', resetInactivityTimer);
      window.removeEventListener('keydown', resetInactivityTimer);
    };
  }, [viewMode]);

  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const currentFullDate = getTodayString();
      
      const toTrigger = reminders.filter(r => {
        if (r.isCompleted) return false;
        if (r.date !== currentFullDate) return false;
        
        if (r.snoozeUntil) {
             if (now.getTime() < r.snoozeUntil) return false;
        } else {
             if (r.time !== currentTime) return false;
        }

        const lastReminded = r.lastRemindedAt || 0;
        return (Date.now() - lastReminded) > 60000;
      });

      if (toTrigger.length > 0) {
        const nowTs = Date.now();
        const updatedReminders = reminders.map(r => 
           toTrigger.find(tr => tr.id === r.id) 
           ? { ...r, lastRemindedAt: nowTs, snoozeUntil: undefined } 
           : r
        );
        setReminders(updatedReminders);
        
        setActiveReminders(prev => {
            const newIds = toTrigger.map(t => t.id);
            const existingIds = prev.map(p => p.id);
            const uniqueToAdd = toTrigger.filter(t => !existingIds.includes(t.id));
            return [...prev, ...uniqueToAdd];
        });
      }
    };

    const interval = setInterval(checkAlarms, 1000);
    return () => clearInterval(interval);
  }, [reminders]);

  const handleNextOccurrence = (reminder: Reminder): Reminder | null => {
      if (!reminder.recurrence || reminder.recurrence === 'once') return null;

      const current = new Date(reminder.date + 'T' + reminder.time);
      let next = new Date(current);
      
      switch (reminder.recurrence) {
          case 'daily': next.setDate(next.getDate() + 1); break;
          case 'weekly': next.setDate(next.getDate() + 7); break;
          case 'monthly': next.setMonth(next.getMonth() + 1); break;
          case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      }
      const y = next.getFullYear();
      const m = String(next.getMonth() + 1).padStart(2, '0');
      const d = String(next.getDate()).padStart(2, '0');
      
      return {
          ...reminder,
          id: uuidv4(),
          date: `${y}-${m}-${d}`,
          isCompleted: false,
          lastRemindedAt: undefined,
          snoozeUntil: undefined
      };
  };

  const toggleComplete = (id: string) => {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    
    // Logic: Allow unchecking (reverting to incomplete)
    if (reminder.isCompleted) {
         setReminders(reminders.map(r => r.id === id ? { ...r, isCompleted: false } : r));
         return;
    }

    // Safety check for TTS
    if (typeof window !== 'undefined' && window.speechSynthesis && 'speechSynthesis' in window) {
             window.speechSynthesis.cancel();
             const remaining = activeReminders.filter(r => r.id !== id);
             if (remaining.length === 0) {
                 const msg = new SpeechSynthesisUtterance("太棒了，所有任务都完成了。");
                 msg.lang = 'zh-CN';
                 window.speechSynthesis.speak(msg);
             }
    }

    let newReminders = reminders.map(r => r.id === id ? { ...r, isCompleted: true } : r);
    
    if (reminder.recurrence && reminder.recurrence !== 'once') {
        const nextInstance = handleNextOccurrence(reminder);
        if (nextInstance) newReminders.push(nextInstance);
    }
    
    setReminders(newReminders);
    setActiveReminders(activeReminders.filter(r => r.id !== id));
  };

  const handleSnooze = (id: string | null, durationMinutes: number) => {
    const snoozeTime = Date.now() + durationMinutes * 60 * 1000;
    
    if (id) {
        setReminders(reminders.map(r => 
            r.id === id ? { ...r, snoozeUntil: snoozeTime } : r
        ));
        setActiveReminders(activeReminders.filter(r => r.id !== id));
    } else {
        const activeIds = activeReminders.map(r => r.id);
        setReminders(reminders.map(r => 
            activeIds.includes(r.id) ? { ...r, snoozeUntil: snoozeTime } : r
        ));
        setActiveReminders([]);
    }
  };

  const handleAddReminder = (data: Omit<Reminder, 'id'>) => {
    const newReminder = { ...data, id: uuidv4(), isCompleted: false };
    setReminders([...reminders, newReminder]);
  };

  const handleEditReminder = (data: Omit<Reminder, 'id'>) => {
      if (editingReminder) {
          setReminders(reminders.map(r => r.id === editingReminder.id ? { ...data, id: editingReminder.id } : r));
          setEditingReminder(null);
      }
  };

  const handleDeleteReminder = () => {
      if (deleteTargetId) {
          setReminders(reminders.filter(r => r.id !== deleteTargetId));
          setDeleteTargetId(null);
      }
  };

  const switchUser = (user: User) => {
    setCurrentUser(user);
    setViewMode('user');
    setTimeout(() => {
        if (avatarRefs.current[user.id]) {
            avatarRefs.current[user.id]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }, 100);
  };
  
  const goHome = () => {
      setViewMode('home');
      setCurrentUser({ id: 'all', name: '全家人', avatar: '🏠', color: 'bg-slate-500' });
  };

  const filteredReminders = reminders
    .filter(r => r.date === selectedDate)
    .filter(r => viewMode === 'home' ? true : r.userId === currentUser.id)
    .sort((a, b) => {
        if (a.isCompleted === b.isCompleted) return a.time.localeCompare(b.time);
        return a.isCompleted ? 1 : -1;
    });

  const changeDate = (offset: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + offset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setSelectedDate(`${y}-${m}-${day}`);
  };

  return (
    <div className="min-h-screen h-[100dvh] bg-slate-50 flex flex-col md:flex-row overflow-hidden">
      
      <nav className={`
        flex-shrink-0 z-30 bg-white shadow-xl relative transition-all duration-300
        flex flex-row md:flex-col landscape:flex-col
        w-full md:w-24 landscape:w-16
        h-20 md:h-full landscape:h-full
        items-center justify-between
        border-b md:border-b-0 md:border-r border-slate-100
      `}>
          
          <div className="absolute top-0 bottom-0 right-0 w-px bg-slate-200 hidden md:block landscape:block z-0"></div>

          <div className="flex md:flex-col landscape:flex-col items-center w-auto md:w-full landscape:w-full p-2 md:p-0 landscape:p-0 gap-2 md:gap-4 landscape:gap-2">
               <button 
                  onClick={() => { setSettingsInitialTab('family'); setIsSettingsModalOpen(true); }}
                  className="w-10 h-10 md:w-12 md:h-12 landscape:w-8 landscape:h-8 rounded-2xl bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex items-center justify-center transition-colors my-2 md:mt-6 landscape:mt-2 mx-auto"
                >
                  <i className="fa-solid fa-gear text-lg landscape:text-sm"></i>
               </button>
               
               <div className="w-px h-8 bg-slate-200 md:w-8 md:h-px landscape:w-6 landscape:h-px"></div>

               <div className="relative w-full flex justify-center">
                    <button 
                        onClick={goHome}
                        className={`
                            relative z-20 w-12 h-12 md:w-16 md:h-16 landscape:w-12 landscape:h-12 flex flex-col items-center justify-center transition-all duration-300
                            ${viewMode === 'home' ? 'text-slate-700 scale-110' : 'text-slate-300 hover:text-slate-500 scale-100'}
                        `}
                    >
                        <span className="text-2xl md:text-3xl landscape:text-xl drop-shadow-sm">🏠</span>
                        {viewMode === 'home' && <span className="text-[10px] font-bold mt-1 text-slate-600 landscape:hidden">全家</span>}
                    </button>
                    {viewMode === 'home' && (
                        <div className={`
                            absolute z-10 bg-slate-50
                            inset-0 md:left-0 md:right-0 landscape:left-0 landscape:right-0
                            rounded-t-2xl md:rounded-l-3xl md:rounded-t-none md:rounded-r-none
                            mb-[-1px] md:mb-0 md:mr-[-1px] landscape:mr-[-1px]
                            shadow-[0_0_15px_rgba(0,0,0,0.05)]
                            md:w-full md:h-24 landscape:h-16
                            top-auto bottom-0 md:top-auto
                        `}></div>
                    )}
               </div>
          </div>

          <div className="flex-1 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto landscape:overflow-y-auto scrollbar-hide w-full flex flex-row md:flex-col landscape:flex-col items-center gap-3 md:gap-6 landscape:gap-2 px-4 md:px-0 landscape:px-0 py-2 md:py-4 landscape:py-2">
             {users.map(user => {
                 const isActive = viewMode === 'user' && currentUser.id === user.id;
                 return (
                     <div key={user.id} className="relative w-full flex justify-center group">
                        <button
                            ref={el => { avatarRefs.current[user.id] = el }}
                            onClick={() => switchUser(user)}
                            className={`
                                relative z-20 w-12 h-12 md:w-14 md:h-14 landscape:w-10 landscape:h-10 rounded-full flex items-center justify-center text-2xl md:text-3xl landscape:text-xl transition-all duration-300 border-2 shadow-sm
                                ${isActive ? `border-${user.color.split('-')[1]}-500 scale-110 ring-2 ring-${user.color.split('-')[1]}-100` : 'border-white opacity-90 scale-95 hover:scale-105 hover:opacity-100'}
                                ${user.color} text-white
                            `}
                        >
                            {user.avatar}
                        </button>
                        
                        <span className={`
                            absolute -bottom-4 md:bottom-auto md:top-1 landscape:hidden md:left-14 md:ml-2 
                            text-[10px] font-bold bg-slate-800 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none
                        `}>
                            {user.name}
                        </span>
                        
                        <span className={`
                           absolute -bottom-5 text-[9px] font-bold text-slate-400 w-full text-center truncate px-1
                           md:hidden landscape:hidden
                           ${isActive ? 'text-slate-800' : ''}
                        `}>
                            {user.name}
                        </span>

                        {isActive && (
                            <div className={`
                                absolute z-10 
                                ${user.color.replace('500', '50')} 
                                inset-0 -mx-2 md:mx-0
                                rounded-t-2xl md:rounded-l-3xl md:rounded-t-none md:rounded-r-none
                                mb-[-1px] md:mb-0 md:mr-[-1px] landscape:mr-[-1px]
                                md:w-full md:h-24 landscape:h-16
                                top-auto bottom-[-10px] md:-top-5 landscape:-top-3
                                shadow-[0_0_15px_rgba(0,0,0,0.05)]
                            `}></div>
                        )}
                     </div>
                 );
             })}
          </div>
      </nav>

      <main className={`
         flex-1 relative z-20 overflow-hidden flex flex-col transition-colors duration-500
         ${viewMode === 'home' ? 'bg-slate-50' : currentUser.color.replace('500', '50')}
         rounded-none md:-ml-px landscape:-ml-px mt-[-1px] md:mt-0 landscape:mt-0
      `}>
          
          {/* HEADER RESTORED for Landscape */}
          <header className="px-6 py-6 landscape:px-4 landscape:py-2 flex justify-between items-end flex-shrink-0">
              <div>
                  <h1 className="text-3xl landscape:text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                      {viewMode === 'home' ? (
                          <><span>📅</span> <span>智能日程</span></>
                      ) : (
                          <><span>{currentUser.avatar}</span> <span>{currentUser.name}的提醒</span></>
                      )}
                  </h1>
                  <div className="flex items-center gap-3 mt-1 landscape:mt-1">
                      <p className="text-slate-500 font-medium landscape:text-xs landscape:font-bold">
                        {selectedDate === getTodayString() ? '今天' : selectedDate}
                         {' '}{new Date(selectedDate).toLocaleDateString('zh-CN', { weekday: 'long' })}
                      </p>
                      
                      <div className="flex bg-white rounded-lg shadow-sm border border-slate-100 p-0.5">
                          <button onClick={() => changeDate(-1)} className="w-8 h-8 landscape:w-6 landscape:h-6 flex items-center justify-center hover:bg-slate-50 rounded text-slate-400"><i className="fa-solid fa-chevron-left landscape:text-[10px]"></i></button>
                          <button onClick={() => setSelectedDate(getTodayString())} className="px-3 landscape:px-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded">今天</button>
                          <button onClick={() => changeDate(1)} className="w-8 h-8 landscape:w-6 landscape:h-6 flex items-center justify-center hover:bg-slate-50 rounded text-slate-400"><i className="fa-solid fa-chevron-right landscape:text-[10px]"></i></button>
                      </div>

                      <button 
                         onClick={() => setViewMode(viewMode === 'calendar' ? 'home' : 'calendar')}
                         className={`w-8 h-8 landscape:w-6 landscape:h-6 flex items-center justify-center rounded-lg border transition-colors ${viewMode === 'calendar' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                      >
                          <i className="fa-regular fa-calendar landscape:text-[10px]"></i>
                      </button>
                  </div>
              </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 landscape:px-4 pb-24 landscape:pb-14 pt-0 scrollbar-hide min-h-0">
              
              {viewMode === 'calendar' ? (
                  <CalendarView 
                    currentDate={new Date(selectedDate)}
                    reminders={reminders}
                    users={users}
                    onSelectDate={(d) => { setSelectedDate(d); setViewMode('home'); }}
                    onClose={() => setViewMode('home')}
                  />
              ) : (
                <div className="space-y-3 landscape:space-y-2 max-w-2xl landscape:max-w-4xl">
                    {filteredReminders.length === 0 ? (
                        <div className="text-center py-20 opacity-40">
                            <div className="text-6xl mb-4 landscape:hidden">🍃</div>
                            <p className="font-medium text-slate-500">没有安排，享受生活吧</p>
                        </div>
                    ) : (
                        filteredReminders.map(reminder => {
                            const rUser = users.find(u => u.id === reminder.userId) || currentUser;
                            const typeDef = reminderTypes.find(t => t.id === reminder.type) || DEFAULT_REMINDER_TYPES[2];

                            return (
                                <div 
                                    key={reminder.id} 
                                    className={`
                                        group relative bg-white rounded-2xl landscape:rounded-xl p-5 landscape:p-2 shadow-sm border-l-4 transition-all hover:shadow-md
                                        ${reminder.isCompleted ? 'opacity-60 grayscale-[0.5] border-slate-200' : `${typeDef.color.replace('bg-', 'border-')} border-opacity-50`}
                                        flex items-center gap-4 landscape:gap-2
                                    `}
                                >
                                    <button 
                                        onClick={() => toggleComplete(reminder.id)}
                                        className={`
                                            w-8 h-8 landscape:w-6 landscape:h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0
                                            ${reminder.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 text-transparent hover:border-blue-400'}
                                        `}
                                    >
                                        <i className="fa-solid fa-check text-sm landscape:text-[10px]"></i>
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-mono font-bold text-xl landscape:text-base text-slate-700">{reminder.time}</span>
                                            {viewMode === 'home' && (
                                                <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    <span className="text-xs">{rUser.avatar}</span>
                                                    <span className="text-[10px] font-bold text-slate-600 truncate max-w-[60px]">{rUser.name}</span>
                                                </div>
                                            )}
                                            {reminder.recurrence && reminder.recurrence !== 'once' && (
                                                <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 rounded font-bold">
                                                    <i className="fa-solid fa-repeat mr-1"></i>
                                                    {{'daily':'每天', 'weekly':'每周', 'monthly':'每月', 'yearly':'每年'}[reminder.recurrence]}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className={`font-bold text-lg landscape:text-sm text-slate-800 truncate ${reminder.isCompleted ? 'line-through decoration-2 decoration-slate-400 text-slate-500' : ''}`}>
                                            {reminder.title}
                                        </h3>
                                    </div>

                                    <div className={`w-10 h-10 landscape:w-7 landscape:h-7 rounded-xl ${typeDef.color} bg-opacity-10 flex items-center justify-center text-${typeDef.color.replace('bg-', '')}-600`}>
                                        <i className={`fa-solid fa-${typeDef.icon} text-lg landscape:text-xs`}></i>
                                    </div>

                                    <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity">
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setEditingReminder(reminder); setIsManualModalOpen(true); }}
                                            className="w-8 h-8 landscape:w-6 landscape:h-6 flex items-center justify-center bg-white rounded-lg shadow-sm text-black hover:text-blue-600 z-20"
                                        >
                                            <i className="fa-solid fa-pen text-xs"></i>
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setDeleteTargetId(reminder.id); }}
                                            className="w-8 h-8 landscape:w-6 landscape:h-6 flex items-center justify-center bg-white rounded-lg shadow-sm text-black hover:text-red-500 z-20"
                                        >
                                            <i className="fa-solid fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
              )}
          </div>

          <VoiceInput 
            currentUser={currentUser} 
            users={users}
            onAddReminder={handleAddReminder}
            onManualInput={() => { setEditingReminder(null); setIsManualModalOpen(true); }}
            voiceSettings={voiceSettings}
            aiSettings={aiSettings}
          />

      </main>

      <AlarmOverlay 
        reminders={activeReminders}
        users={users}
        onComplete={toggleComplete}
        onSnooze={handleSnooze}
        voiceSettings={voiceSettings}
        aiSettings={aiSettings}
      />

      <ManualInputModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSave={editingReminder ? handleEditReminder : handleAddReminder}
        users={users}
        currentUser={currentUser}
        initialData={editingReminder || undefined}
        reminderTypes={reminderTypes}
        onManageTypes={() => { setSettingsInitialTab('types'); setIsSettingsModalOpen(true); setIsManualModalOpen(false); }}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        users={users}
        setUsers={setUsers}
        voiceSettings={voiceSettings}
        setVoiceSettings={setVoiceSettings}
        aiSettings={aiSettings}
        setAiSettings={setAiSettings}
        reminders={reminders}
        setReminders={setReminders}
        cloudSettings={cloudSettings}
        setCloudSettings={setCloudSettings}
        reminderTypes={reminderTypes}
        setReminderTypes={setReminderTypes}
        initialTab={settingsInitialTab}
      />

      <ConfirmModal
        isOpen={!!deleteTargetId}
        title="确认删除"
        message="确定要删除这个提醒吗？此操作无法撤销。"
        onConfirm={handleDeleteReminder}
        onCancel={() => setDeleteTargetId(null)}
      />

    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;