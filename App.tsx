import React, { useState, useEffect, useRef, ErrorInfo } from 'react';
import { MOCK_USERS, INITIAL_REMINDERS, ALARM_SOUND_DATA_URI, getTodayString, DEFAULT_REMINDER_TYPES } from './constants';
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
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 animate-fade-in">
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

  // New State for View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  // State for Date Selection
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
        // Migration logic
        const today = getTodayString();
        if (Array.isArray(loaded)) {
            loaded = loaded.map((r: any) => ({
                ...r,
                date: r.date || today,
                recurrence: r.recurrence || 'once' // Migrate recurrence
            }));
            return loaded;
        }
        return INITIAL_REMINDERS;
    } catch { return INITIAL_REMINDERS; }
  });

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    try {
        const saved = localStorage.getItem('family_voice_settings');
        return saved ? JSON.parse(saved) : { voiceURI: '', pitch: 1.0, rate: 1.0, volume: 1.0 };
    } catch { return { voiceURI: '', pitch: 1.0, rate: 1.0, volume: 1.0 }; }
  });

  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    const defaultSettings: AISettings = { 
        activeProvider: 'gemini',
        configs: {
            gemini: { apiKey: '', baseUrl: '', model: 'gemini-2.5-flash' },
            deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
            moonshot: { apiKey: '', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
            siliconflow: { apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
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

  useEffect(() => { localStorage.setItem('family_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem('family_reminders', JSON.stringify(reminders)); }, [reminders]);
  useEffect(() => { localStorage.setItem('family_voice_settings', JSON.stringify(voiceSettings)); }, [voiceSettings]);
  useEffect(() => { localStorage.setItem('family_ai_settings', JSON.stringify(aiSettings)); }, [aiSettings]);
  useEffect(() => { localStorage.setItem('family_cloud_settings', JSON.stringify(cloudSettings)); }, [cloudSettings]);
  useEffect(() => { localStorage.setItem('family_reminder_types', JSON.stringify(reminderTypes)); }, [reminderTypes]);

  useEffect(() => {
      const backupData = {
          users, reminders, voiceSettings, aiSettings, reminderTypes, backupTime: new Date().toISOString(), type: 'auto'
      };
      localStorage.setItem('family_auto_backup', JSON.stringify(backupData));
  }, [users, reminders, voiceSettings, aiSettings, reminderTypes]);

  useEffect(() => {
      const checkAndSync = async () => {
          const { cloudSettings, users, reminders, voiceSettings, aiSettings, reminderTypes } = latestDataRef.current;
          if (!cloudSettings.autoSyncEnabled || !cloudSettings.apiKey || !cloudSettings.binId) return;
          const now = Date.now();
          const lastSync = cloudSettings.lastAutoSync || 0;
          const intervalMs = cloudSettings.autoSyncInterval * 60 * 1000;

          if (now - lastSync > intervalMs) {
              try {
                  const syncData = {
                      users, reminders, voiceSettings, aiSettings, reminderTypes, version: "1.1", lastUpdated: new Date().toISOString()
                  };
                  await updateCloudBackup(cloudSettings.apiKey, cloudSettings.binId, syncData);
                  setCloudSettings(prev => ({ ...prev, lastAutoSync: Date.now() }));
              } catch (e) { console.error(e); }
          }
      };
      const timer = setInterval(checkAndSync, 60000);
      return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
        if (!audioUnlockedRef.current) {
            const audio = new Audio(ALARM_SOUND_DATA_URI);
            audio.volume = 0;
            audio.play().then(() => { audioUnlockedRef.current = true; }).catch(() => {});
        }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (viewMode === 'user') {
        const el = avatarRefs.current[currentUser.id];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentUser.id, viewMode]);

  useEffect(() => {
    const resetTimer = () => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        if (viewMode === 'user') {
            inactivityTimerRef.current = setTimeout(() => { setViewMode('home'); }, 3 * 60 * 1000);
        }
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('scroll', resetTimer);
    resetTimer();
    return () => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('click', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('touchstart', resetTimer);
        window.removeEventListener('scroll', resetTimer);
    };
  }, [viewMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const todayString = getTodayString();
      const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const currentTimestamp = now.getTime();

      if (todayString !== systemTodayRef.current) {
          setSelectedDate(prevDate => prevDate === systemTodayRef.current ? todayString : prevDate);
          systemTodayRef.current = todayString;
      }

      setReminders(currentReminders => {
        let hasUpdates = false;
        const nextReminders = [...currentReminders];
        const newActiveReminders: Reminder[] = [];

        nextReminders.forEach((reminder, index) => {
           if (reminder.isCompleted) return;
           let shouldRemind = false;
           if (reminder.date === todayString && reminder.time === currentTime) {
                const lastReminded = reminder.lastRemindedAt || 0;
                if (Date.now() - lastReminded > 60000) shouldRemind = true;
           }
           if (reminder.snoozeUntil && currentTimestamp >= reminder.snoozeUntil) shouldRemind = true;

           if (shouldRemind) {
               nextReminders[index] = { 
                   ...reminder, 
                   lastRemindedAt: Date.now(),
                   snoozeUntil: undefined
               };
               hasUpdates = true;
               newActiveReminders.push(nextReminders[index]);
           }
        });

        if (newActiveReminders.length > 0) {
            setActiveReminders(prev => {
                const combined = [...prev];
                newActiveReminders.forEach(newR => {
                    if (!combined.find(existing => existing.id === newR.id)) combined.push(newR);
                });
                return combined;
            });
        }
        return hasUpdates ? nextReminders : currentReminders;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveReminder = (data: Omit<Reminder, 'id'>) => {
    if (editingReminder) {
        setReminders(prev => prev.map(r => r.id === editingReminder.id ? { ...r, ...data } : r));
        setEditingReminder(null);
    } else {
        const newReminder: Reminder = { ...data, id: uuidv4() };
        setReminders(prev => [...prev, newReminder]);
    }
  };

  const handleEditClick = (e: React.MouseEvent, reminder: Reminder) => {
      e.stopPropagation();
      setEditingReminder(reminder);
      setIsManualModalOpen(true);
  };

  const toggleComplete = (id: string) => {
    const r = reminders.find(item => item.id === id);
    if (!r) return;

    // Logic for next recurrence
    const nextReminders: Reminder[] = [];
    if (!r.isCompleted && r.recurrence && r.recurrence !== 'once') {
        const nextDate = new Date(r.date);
        if (r.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (r.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (r.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (r.recurrence === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
        
        const year = nextDate.getFullYear();
        const month = String(nextDate.getMonth() + 1).padStart(2, '0');
        const day = String(nextDate.getDate()).padStart(2, '0');
        
        nextReminders.push({
            ...r,
            id: uuidv4(),
            date: `${year}-${month}-${day}`,
            isCompleted: false,
            lastRemindedAt: undefined,
            snoozeUntil: undefined
        });
    }

    setReminders(prev => {
        let updated = prev.map(item => item.id === id ? { ...item, isCompleted: !item.isCompleted } : item);
        if (nextReminders.length > 0) updated = [...updated, ...nextReminders];
        return updated;
    });
  };

  const requestDeleteReminder = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDeleteTargetId(id);
  };

  const confirmDeleteReminder = () => {
    if (deleteTargetId) {
        setReminders(prev => prev.filter(r => r.id !== deleteTargetId));
        setDeleteTargetId(null);
    }
  };

  const handleSingleAlarmComplete = (id: string) => {
      // Use the toggleComplete logic to ensure recurrence works for alarms too
      toggleComplete(id);
      setActiveReminders(prev => {
          const next = prev.filter(r => r.id !== id);
          if (next.length === 0) {
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                  const msg = new SpeechSynthesisUtterance("太棒了，所有任务已完成！");
                  msg.lang = 'zh-CN';
                  if (voiceSettings.voiceURI) {
                    const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI);
                    if (voice) msg.voice = voice;
                  }
                  msg.rate = voiceSettings.rate;
                  msg.pitch = voiceSettings.pitch;
                  window.speechSynthesis.speak(msg);
              }
          }
          return next;
      });
  };

  const handleSnoozeReminder = (id: string | null, durationMinutes: number) => {
    const snoozeTime = Date.now() + durationMinutes * 60 * 1000;
    const snoozeIds = id ? [id] : activeReminders.map(r => r.id);
    setReminders(prev => prev.map(r => {
        if (snoozeIds.includes(r.id)) return { ...r, snoozeUntil: snoozeTime };
        return r;
    }));
    setActiveReminders(prev => prev.filter(r => !snoozeIds.includes(r.id)));
  };

  const handleOpenManualModal = () => {
      setEditingReminder(null);
      setIsManualModalOpen(true);
  };

  const switchToUser = (u: User) => { setCurrentUser(u); setViewMode('user'); };
  const switchToHome = () => { setViewMode('home'); };

  const changeDate = (offset: number) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + offset);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
  };

  const filteredReminders = reminders.filter(r => {
      if (r.date !== selectedDate) return false;
      if (viewMode === 'home') return true;
      return r.userId === currentUser.id;
  });

  const displayedReminders = filteredReminders.sort((a, b) => {
      if (a.isCompleted === b.isCompleted) return a.time.localeCompare(b.time);
      return a.isCompleted ? 1 : -1;
  });

  const themeColorName = viewMode === 'home' ? 'slate' : getColorName(currentUser.color);
  const themeBgMap: {[key: string]: string} = {
      'blue': 'bg-blue-50', 'emerald': 'bg-emerald-50', 'indigo': 'bg-indigo-50',
      'rose': 'bg-rose-50', 'yellow': 'bg-yellow-50', 'purple': 'bg-purple-50',
      'cyan': 'bg-cyan-50', 'orange': 'bg-orange-50', 'slate': 'bg-slate-50'
  };
  const themeTextClass = {
      'blue': 'text-blue-900', 'emerald': 'text-emerald-900', 'indigo': 'text-indigo-900',
      'rose': 'text-rose-900', 'yellow': 'text-yellow-900', 'purple': 'text-purple-900',
      'cyan': 'text-cyan-900', 'orange': 'text-orange-900', 'slate': 'text-slate-900'
  }[themeColorName] || 'text-slate-900';
  const themeBgClass = themeBgMap[themeColorName] || 'bg-slate-50';
  const voiceContextUser = viewMode === 'home' ? { id: 'all', name: '全家人', avatar: '🏠', color: 'bg-slate-500' } : currentUser;

  return (
    <div className="h-screen flex flex-col landscape:flex-row md:flex-row bg-white overflow-hidden">
      <ConfirmModal 
        isOpen={!!deleteTargetId}
        title="确认删除"
        message="您确定要删除这条提醒吗？"
        onConfirm={confirmDeleteReminder}
        onCancel={() => setDeleteTargetId(null)}
      />

      {activeReminders.length > 0 && (
        <AlarmOverlay 
            reminders={activeReminders} 
            users={users}
            onComplete={handleSingleAlarmComplete}
            onSnooze={handleSnoozeReminder}
            voiceSettings={voiceSettings}
        />
      )}

      <ManualInputModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSave={handleSaveReminder}
        users={users}
        currentUser={voiceContextUser}
        initialData={editingReminder || undefined}
        reminderTypes={reminderTypes}
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
      />

      {/* SIDEBAR */}
      <div className="flex-shrink-0 bg-white md:w-28 landscape:w-16 md:h-full landscape:h-full flex md:flex-col landscape:flex-col z-30 relative shadow-xl landscape:shadow-none border-b landscape:border-b-0 md:border-b-0">
        <div className="absolute z-0 bg-slate-200 hidden md:block landscape:block top-0 bottom-0 right-0 w-px"></div>
        <div className="absolute z-0 bg-slate-200 md:hidden landscape:hidden left-0 right-0 bottom-0 h-px"></div>

        <div className="flex md:flex-col landscape:flex-col items-center flex-shrink-0 z-20 w-auto md:w-full landscape:w-full relative">
            <div className="p-2 md:p-3 landscape:p-2 w-full flex justify-center">
              <button 
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors flex items-center justify-center relative z-20"
              >
                  <i className="fa-solid fa-gear text-lg"></i>
              </button>
            </div>
            <div className="w-px h-6 md:w-16 landscape:w-8 md:h-px landscape:h-px bg-slate-100 my-1 mx-auto relative z-20"></div>
            <div className="w-full flex justify-end md:justify-center landscape:justify-center">
                <div onClick={switchToHome} className={`relative w-full flex flex-col items-center group cursor-pointer transition-all duration-300 py-3 md:py-4 landscape:py-2 ${viewMode === 'home' && !isSettingsModalOpen ? themeBgClass + ' rounded-none z-10' : 'bg-white hover:bg-slate-50 z-10'}`}>
                    <button className={`relative w-12 h-12 md:w-14 md:h-14 landscape:w-8 landscape:h-8 rounded-2xl flex items-center justify-center text-3xl landscape:text-base transition-all duration-300 ${viewMode === 'home' ? 'bg-white text-slate-800 shadow-sm scale-105' : 'bg-slate-100 text-slate-500'}`}>
                        <i className="fa-solid fa-house text-2xl landscape:text-base"></i>
                    </button>
                    <span className={`pt-1 text-[10px] font-bold transition-all duration-300 ${viewMode === 'home' ? 'text-slate-800' : 'text-slate-400'}`}>主页</span>
                </div>
            </div>
             <div className="w-px h-6 md:w-16 landscape:w-8 md:h-px landscape:h-px bg-slate-100 my-1 mx-auto relative z-20"></div>
        </div>

        <div className="flex-1 overflow-x-auto md:overflow-y-auto landscape:overflow-y-auto landscape:overflow-x-hidden w-full scrollbar-hide relative z-20">
             <div className="flex md:flex-col landscape:flex-col items-center min-w-max md:w-full landscape:w-full">
                {users.map(u => {
                    const isSelected = viewMode === 'user' && currentUser.id === u.id;
                    return (
                        <div key={u.id} onClick={() => switchToUser(u)} className={`relative w-full flex flex-col items-center group cursor-pointer transition-all duration-300 py-3 md:py-4 landscape:py-2 px-2 ${isSelected ? themeBgClass + ' rounded-none z-10' : 'bg-white hover:bg-slate-50 z-10'}`}>
                            <button ref={el => { avatarRefs.current[u.id] = el; }} className={`relative w-12 h-12 md:w-14 md:h-14 landscape:w-8 landscape:h-8 rounded-2xl flex items-center justify-center text-3xl landscape:text-base transition-all duration-300 flex-shrink-0 ${u.color} text-white ${isSelected ? 'shadow-lg scale-105 ring-4 ring-white' : 'opacity-90 hover:opacity-100 scale-95'}`}>
                                {u.avatar}
                            </button>
                            <span className={`pt-1 text-[10px] font-bold truncate max-w-[60px] text-center transition-all duration-300 ${isSelected ? themeTextClass : 'text-slate-400'}`}>{u.name}</span>
                        </div>
                    );
                })}
                <div className="w-4 md:h-24 landscape:h-24 flex-shrink-0"></div>
             </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className={`flex-1 relative flex flex-col transition-colors duration-500 ${viewMode === 'calendar' ? 'bg-white' : themeBgClass} overflow-hidden rounded-none shadow-none z-20 md:-ml-px landscape:-ml-px -mt-px landscape:mt-0`}>
        {viewMode === 'calendar' ? (
            <CalendarView currentDate={new Date(selectedDate)} reminders={reminders} users={users} onSelectDate={(dateStr) => { setSelectedDate(dateStr); setViewMode('home'); }} onClose={() => setViewMode('home')} />
        ) : (
            <>
            <div className="flex-1 overflow-y-auto p-4 md:p-8 landscape:p-2 pb-32 landscape:pb-12 scrollbar-hide">
                <div className="max-w-2xl mx-auto">
                    <div className="flex justify-between items-end mb-6 landscape:mb-2 sticky top-0 z-10 py-4 landscape:py-2 bg-inherit/95 backdrop-blur-sm border-b border-black/5">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-sm font-medium opacity-60">
                                <button onClick={() => changeDate(-1)} className="hover:bg-black/5 p-1 rounded"><i className="fa-solid fa-chevron-left"></i></button>
                                <span>{selectedDate}</span>
                                <button onClick={() => changeDate(1)} className="hover:bg-black/5 p-1 rounded"><i className="fa-solid fa-chevron-right"></i></button>
                                <button onClick={() => setViewMode('calendar')} className="ml-2 w-7 h-7 flex items-center justify-center rounded bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors" title="日历视图">
                                    <i className="fa-solid fa-calendar-days text-sm"></i>
                                </button>
                                {selectedDate !== getTodayString() && (
                                    <button onClick={() => setSelectedDate(getTodayString())} className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded ml-2">回今天</button>
                                )}
                            </div>
                            <h2 className={`text-3xl landscape:text-lg font-bold ${themeTextClass}`}>
                                {viewMode === 'home' ? '今日概览' : `${currentUser.name}`}
                            </h2>
                        </div>
                        <div className={`text-sm font-bold px-3 py-1 rounded-full bg-white/60 backdrop-blur-sm shadow-sm ${themeTextClass}`}>
                            {displayedReminders.filter(r => !r.isCompleted).length} 待办
                        </div>
                    </div>

                    {displayedReminders.length === 0 ? (
                        <div className="text-center py-20 landscape:py-6 bg-white/40 backdrop-blur-sm rounded-3xl border-2 border-dashed border-white/50">
                            <div className="text-6xl landscape:text-3xl mb-4 opacity-50 animate-bounce">{viewMode === 'home' ? '🏠' : currentUser.avatar}</div>
                            <p className={`text-xl landscape:text-base font-bold ${themeTextClass} opacity-60`}>无安排</p>
                            <p className="text-sm text-slate-500 mt-2 opacity-70">点击下方添加</p>
                        </div>
                    ) : (
                        <div className="space-y-3 landscape:space-y-2">
                        {displayedReminders.map((reminder) => {
                            const rUser = users.find(u => u.id === reminder.userId) || users[0];
                            const rType = reminderTypes.find(t => t.id === reminder.type) || DEFAULT_REMINDER_TYPES[2];
                            // COMPACT UI for small screens
                            return (
                                <div key={reminder.id} className={`group relative overflow-hidden rounded-xl p-3 md:p-5 landscape:p-2 transition-all duration-300 ${reminder.isCompleted ? 'bg-slate-100/60 border border-transparent opacity-60' : 'bg-white shadow-md shadow-slate-200/20 border border-white hover:shadow-lg'}`}>
                                    <div className="flex items-center gap-3 landscape:gap-2">
                                        <button onClick={() => toggleComplete(reminder.id)} className={`flex-shrink-0 w-8 h-8 md:w-8 md:h-8 landscape:w-6 landscape:h-6 rounded-full border-2 flex items-center justify-center transition-all ${reminder.isCompleted ? 'bg-green-500 border-green-500 text-white' : `border-slate-300 text-transparent hover:border-slate-400`}`}>
                                            <i className="fa-solid fa-check text-sm landscape:text-xs"></i>
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center">
                                                <div className="flex flex-col min-w-0">
                                                    {viewMode === 'home' && (
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${rUser.color} text-white font-bold whitespace-nowrap`}>
                                                                {rUser.avatar} {rUser.name}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className={`font-bold text-base md:text-lg landscape:text-sm leading-snug truncate ${reminder.isCompleted ? 'text-slate-600 decoration-slate-500 decoration-2 line-through' : 'text-slate-800'}`}>
                                                        {reminder.title}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                    <span className={`text-xl landscape:text-base font-mono font-bold tracking-tight ${reminder.isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                                                        {reminder.time}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[10px] font-bold ${rType.color.replace('bg-', 'text-')} bg-opacity-10 px-1.5 py-0.5 rounded bg-gray-100`}>
                                                    <i className={`fa-solid fa-${rType.icon} mr-1`}></i>{rType.label}
                                                </span>
                                                {reminder.recurrence && reminder.recurrence !== 'once' && (
                                                     <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                                                        <i className="fa-solid fa-rotate-right mr-1"></i>
                                                        {reminder.recurrence === 'daily' ? '每天' : reminder.recurrence === 'weekly' ? '每周' : reminder.recurrence === 'monthly' ? '每月' : '每年'}
                                                     </span>
                                                )}
                                                <div className="flex-1"></div>
                                                <button onClick={(e) => handleEditClick(e, reminder)} className="text-slate-400 hover:text-blue-600 px-2 py-1"><i className="fa-solid fa-pencil text-sm"></i></button>
                                                <button onClick={(e) => requestDeleteReminder(e, reminder.id)} className="text-slate-400 hover:text-red-600 px-2 py-1"><i className="fa-solid fa-trash-can text-sm"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    )}
                </div>
            </div>
            <VoiceInput currentUser={voiceContextUser} users={users} onAddReminder={handleSaveReminder} onManualInput={handleOpenManualModal} voiceSettings={voiceSettings} aiSettings={aiSettings} />
            </>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => {
    return <ErrorBoundary><AppContent /></ErrorBoundary>;
};

export default App;