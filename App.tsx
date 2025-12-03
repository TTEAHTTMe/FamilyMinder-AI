
import React, { Component, useState, useEffect, useRef, ErrorInfo } from 'react';
import { MOCK_USERS, INITIAL_REMINDERS, ALARM_SOUND_DATA_URI, getTodayString } from './constants';
import { User, Reminder, VoiceSettings, AISettings, AIProvider, CloudSettings } from './types';
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

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4 animate-fade-in">
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
      // Correctly initialize with system date in local timezone YYYY-MM-DD
      return getTodayString();
  });

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    try {
        const saved = localStorage.getItem('family_reminders');
        let loaded = saved ? JSON.parse(saved) : INITIAL_REMINDERS;
        // Migration for old data without date
        const today = getTodayString();
        if (Array.isArray(loaded)) {
            loaded = loaded.map((r: any) => ({
                ...r,
                date: r.date || today
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

  // AI Settings State with Robust Migration & Sanitization Logic
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
        
        // Paranoid check: parsed must be an object
        if (!parsed || typeof parsed !== 'object') return defaultSettings;

        // Construct a safe config object by merging default with parsed
        const safeConfigs = { ...defaultSettings.configs };
        
        // If the saved data has a 'configs' object, try to merge known keys
        if (parsed.configs && typeof parsed.configs === 'object') {
             const providerKeys = Object.keys(defaultSettings.configs) as AIProvider[];
             providerKeys.forEach(key => {
                 if (parsed.configs[key]) {
                     safeConfigs[key] = {
                         ...defaultSettings.configs[key],
                         ...parsed.configs[key]
                     };
                 }
             });
        } else if (parsed.apiKey) {
             // Legacy migration (flat structure)
             console.log("Migrating legacy flat AI settings...");
             const oldProvider = (parsed.provider || 'gemini') as AIProvider;
             if (safeConfigs[oldProvider]) {
                 safeConfigs[oldProvider].apiKey = parsed.apiKey || '';
                 safeConfigs[oldProvider].baseUrl = parsed.baseUrl || safeConfigs[oldProvider].baseUrl;
                 safeConfigs[oldProvider].model = parsed.model || safeConfigs[oldProvider].model;
             }
        }

        // Validate active provider
        let active = parsed.activeProvider;
        if (!active || !safeConfigs[active as AIProvider]) {
            active = 'gemini';
        }

        return {
            activeProvider: active,
            configs: safeConfigs
        };

    } catch (e) {
        console.error("Failed to parse AI settings, resetting to default", e);
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
              autoSyncInterval: parsed.autoSyncInterval || 60, // Default 1 hour
              lastAutoSync: parsed.lastAutoSync || 0
          };
      } catch { return { apiKey: '', binId: '', autoSyncEnabled: false, autoSyncInterval: 60, lastAutoSync: 0 }; }
  });

  const [activeReminders, setActiveReminders] = useState<Reminder[]>([]);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  
  // Custom Delete Confirmation State
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const audioUnlockedRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Refs for scrolling
  const avatarRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Ref to track the actual system date (to detect day rollover)
  const systemTodayRef = useRef(selectedDate);
  
  // Ref to hold latest data for auto-cloud-sync (prevents closure staleness in intervals)
  const latestDataRef = useRef({ users, reminders, voiceSettings, aiSettings, cloudSettings });

  // --- Effects ---

  // Check if currentUser still exists
  useEffect(() => {
    if (!users.find(u => u.id === currentUser.id)) {
      if (users.length > 0) setCurrentUser(users[0]);
    }
  }, [users, currentUser]);

  // Update ref with latest data whenever it changes
  useEffect(() => {
      latestDataRef.current = { users, reminders, voiceSettings, aiSettings, cloudSettings };
  }, [users, reminders, voiceSettings, aiSettings, cloudSettings]);

  // Persist data
  useEffect(() => {
    localStorage.setItem('family_users', JSON.stringify(users));
  }, [users]);
  useEffect(() => {
    localStorage.setItem('family_reminders', JSON.stringify(reminders));
  }, [reminders]);
  useEffect(() => {
    localStorage.setItem('family_voice_settings', JSON.stringify(voiceSettings));
  }, [voiceSettings]);
  useEffect(() => {
    localStorage.setItem('family_ai_settings', JSON.stringify(aiSettings));
  }, [aiSettings]);
  useEffect(() => {
    localStorage.setItem('family_cloud_settings', JSON.stringify(cloudSettings));
  }, [cloudSettings]);

  // --- AUTOMATIC BACKUP LOGIC (Local) ---
  useEffect(() => {
      const backupData = {
          users,
          reminders,
          voiceSettings,
          aiSettings,
          backupTime: new Date().toISOString(),
          type: 'auto'
      };
      localStorage.setItem('family_auto_backup', JSON.stringify(backupData));
  }, [users, reminders, voiceSettings, aiSettings]);

  // --- AUTOMATIC CLOUD SYNC LOGIC ---
  useEffect(() => {
      const checkAndSync = async () => {
          const { cloudSettings, users, reminders, voiceSettings, aiSettings } = latestDataRef.current;
          
          if (!cloudSettings.autoSyncEnabled || !cloudSettings.apiKey || !cloudSettings.binId) return;

          const now = Date.now();
          const lastSync = cloudSettings.lastAutoSync || 0;
          const intervalMs = cloudSettings.autoSyncInterval * 60 * 1000;

          if (now - lastSync > intervalMs) {
              console.log("Triggering Auto Cloud Sync...");
              try {
                  const syncData = {
                      users,
                      reminders,
                      voiceSettings,
                      aiSettings,
                      version: "1.0",
                      lastUpdated: new Date().toISOString()
                  };
                  await updateCloudBackup(cloudSettings.apiKey, cloudSettings.binId, syncData);
                  
                  // Update last sync time
                  setCloudSettings(prev => ({ ...prev, lastAutoSync: Date.now() }));
                  console.log("Auto Cloud Sync Completed.");
              } catch (e) {
                  console.error("Auto Cloud Sync Failed:", e);
              }
          }
      };

      const timer = setInterval(checkAndSync, 60000); // Check every minute
      return () => clearInterval(timer);
  }, []);

  // Unlock audio
  useEffect(() => {
    const unlockAudio = () => {
        if (!audioUnlockedRef.current) {
            const audio = new Audio(ALARM_SOUND_DATA_URI);
            audio.volume = 0;
            audio.play().then(() => {
                audioUnlockedRef.current = true;
            }).catch(() => {});
        }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Scroll active user into view ONLY if in user mode
  useEffect(() => {
    if (viewMode === 'user') {
        const el = avatarRefs.current[currentUser.id];
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
  }, [currentUser.id, viewMode]);

  // Inactivity Timer (3 Minutes)
  useEffect(() => {
    const resetTimer = () => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        
        // Only set timer if we are NOT in home mode and NOT in calendar mode
        if (viewMode === 'user') {
            inactivityTimerRef.current = setTimeout(() => {
                setViewMode('home');
            }, 3 * 60 * 1000); // 3 minutes
        }
    };

    // Events to detect activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('scroll', resetTimer);

    resetTimer(); // Initialize

    return () => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('click', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('touchstart', resetTimer);
        window.removeEventListener('scroll', resetTimer);
    };
  }, [viewMode]);

  // Clock & Alarm Logic & DATE ROLLOVER Logic
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      // Use getTodayString helper to ensure consistency
      const todayString = getTodayString();

      const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const currentTimestamp = now.getTime();

      // --- DATE ROLLOVER CHECK ---
      // If the system date has changed (e.g. passed midnight)
      if (todayString !== systemTodayRef.current) {
          // If the user was viewing the "old" today, automatically move them to the "new" today.
          // This fixes the issue where an always-on display gets stuck on yesterday's date.
          setSelectedDate(prevDate => {
              if (prevDate === systemTodayRef.current) {
                  return todayString;
              }
              return prevDate; 
          });
          systemTodayRef.current = todayString;
      }

      setReminders(currentReminders => {
        let hasUpdates = false;
        const nextReminders = [...currentReminders];
        const newActiveReminders: Reminder[] = [];

        nextReminders.forEach((reminder, index) => {
           // Check if completed
           if (reminder.isCompleted) return;

           let shouldRemind = false;

           // Condition 1: Date & Time match
           if (reminder.date === todayString && reminder.time === currentTime) {
                const lastReminded = reminder.lastRemindedAt || 0;
                // Prevent duplicate triggering within same minute
                if (Date.now() - lastReminded > 60000) {
                   shouldRemind = true;
                }
           }
           
           // Condition 2: Snooze Time reached
           if (reminder.snoozeUntil && currentTimestamp >= reminder.snoozeUntil) {
               shouldRemind = true;
           }

           if (shouldRemind) {
               nextReminders[index] = { 
                   ...reminder, 
                   lastRemindedAt: Date.now(),
                   snoozeUntil: undefined // Clear snooze once triggered
               };
               hasUpdates = true;
               newActiveReminders.push(nextReminders[index]);
           }
        });

        if (newActiveReminders.length > 0) {
            setActiveReminders(prev => {
                const combined = [...prev];
                newActiveReminders.forEach(newR => {
                    if (!combined.find(existing => existing.id === newR.id)) {
                        combined.push(newR);
                    }
                });
                return combined;
            });
        }

        return hasUpdates ? nextReminders : currentReminders;
      });

    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // --- Handlers ---

  const handleSaveReminder = (data: Omit<Reminder, 'id'>) => {
    if (editingReminder) {
        // Update existing
        setReminders(prev => prev.map(r => r.id === editingReminder.id ? { ...r, ...data } : r));
        setEditingReminder(null);
    } else {
        // Create new
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
    if (r) {
        setReminders(prev => prev.map(item => item.id === id ? { ...item, isCompleted: !item.isCompleted } : item));
    }
  };

  const requestDeleteReminder = (e: React.MouseEvent, id: string) => {
      e.stopPropagation(); // Stop clicking the card
      setDeleteTargetId(id);
  };

  const confirmDeleteReminder = () => {
    if (deleteTargetId) {
        setReminders(prev => prev.filter(r => r.id !== deleteTargetId));
        setDeleteTargetId(null);
    }
  };

  const handleSingleAlarmComplete = (id: string) => {
      setReminders(prev => prev.map(item => item.id === id ? { ...item, isCompleted: true } : item));
      setActiveReminders(prev => {
          const next = prev.filter(r => r.id !== id);
          if (next.length === 0) {
              // Safety Check for Speech API - STRICT CHECK
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
        if (snoozeIds.includes(r.id)) {
            return { ...r, snoozeUntil: snoozeTime };
        }
        return r;
    }));
    
    setActiveReminders(prev => prev.filter(r => !snoozeIds.includes(r.id)));
  };

  const handleOpenManualModal = () => {
      setEditingReminder(null);
      setIsManualModalOpen(true);
  };

  const switchToUser = (u: User) => {
      setCurrentUser(u);
      setViewMode('user');
  };

  const switchToHome = () => {
      setViewMode('home');
  };

  const changeDate = (offset: number) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + offset);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
  };

  // --- Data Filtering & Sorting ---
  // Filter logic: Match Date AND (if user mode, Match User)
  const filteredReminders = reminders.filter(r => {
      const isDateMatch = r.date === selectedDate;
      if (!isDateMatch) return false;
      
      if (viewMode === 'home') return true;
      return r.userId === currentUser.id;
  });

  // Sorting logic: Uncompleted first, then by time
  const displayedReminders = filteredReminders.sort((a, b) => {
      if (a.isCompleted === b.isCompleted) {
          return a.time.localeCompare(b.time);
      }
      return a.isCompleted ? 1 : -1;
  });

  // --- Theme Rendering ---
  const themeColorName = viewMode === 'home' ? 'slate' : getColorName(currentUser.color);
  
  const themeBgMap: {[key: string]: string} = {
      'blue': 'bg-blue-50', 'emerald': 'bg-emerald-50', 'indigo': 'bg-indigo-50',
      'rose': 'bg-rose-50', 'yellow': 'bg-yellow-50', 'purple': 'bg-purple-50',
      'cyan': 'bg-cyan-50', 'orange': 'bg-orange-50', 'slate': 'bg-slate-50'
  };
  const themeTextMap: {[key: string]: string} = {
      'blue': 'text-blue-900', 'emerald': 'text-emerald-900', 'indigo': 'text-indigo-900',
      'rose': 'text-rose-900', 'yellow': 'text-yellow-900', 'purple': 'text-purple-900',
      'cyan': 'text-cyan-900', 'orange': 'text-orange-900', 'slate': 'text-slate-900'
  };

  const themeBgClass = themeBgMap[themeColorName] || 'bg-slate-50';
  const themeTextClass = themeTextMap[themeColorName] || 'text-slate-900';

  const voiceContextUser = viewMode === 'home' 
    ? { id: 'all', name: '全家人', avatar: '🏠', color: 'bg-slate-500' }
    : currentUser;

  return (
    <div className="h-screen flex flex-col md:flex-row bg-white overflow-hidden">
      {/* Delete Confirmation Modal */}
      <ConfirmModal 
        isOpen={!!deleteTargetId}
        title="确认删除"
        message="您确定要删除这条提醒吗？操作无法撤销。"
        onConfirm={confirmDeleteReminder}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Active Alarm Overlay */}
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
      />

      {/* --- SIDEBAR / NAVBAR --- */}
      <div className="flex-shrink-0 bg-white md:w-28 md:h-full flex md:flex-col z-30 relative">
        
        {/* Custom Border Line */}
        <div className="absolute z-0 bg-slate-200 hidden md:block top-0 bottom-0 right-0 w-px"></div>
        <div className="absolute z-0 bg-slate-200 md:hidden left-0 right-0 bottom-0 h-px"></div>

        {/* --- FIXED SECTION (Settings + Home) --- */}
        <div className="flex md:flex-col items-center flex-shrink-0 z-20 w-auto md:w-full relative">
            {/* Settings Button */}
            <div className="p-2 md:p-3 w-full flex justify-center">
              <button 
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors flex items-center justify-center relative z-20"
              >
                  <i className="fa-solid fa-gear text-lg"></i>
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-6 md:w-16 md:h-px bg-slate-100 my-1 mx-auto relative z-20"></div>

            {/* Home Button */}
            <div className="w-full flex justify-end md:justify-center">
                <div 
                    onClick={switchToHome}
                    className={`
                        relative w-full flex flex-col items-center group cursor-pointer transition-all duration-300 py-3 md:py-4
                        ${viewMode === 'home' && !isSettingsModalOpen
                            ? themeBgClass + ' rounded-none z-10' 
                            : 'bg-white hover:bg-slate-50 z-10'}
                    `}
                >
                    <button
                        className={`
                            relative w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-3xl transition-all duration-300
                            ${viewMode === 'home' ? 'bg-white text-slate-800 shadow-sm scale-105' : 'bg-slate-100 text-slate-500'}
                        `}
                    >
                        <i className="fa-solid fa-house text-2xl"></i>
                    </button>
                    <span className={`pt-1 text-[10px] font-bold transition-all duration-300 ${viewMode === 'home' ? 'text-slate-800' : 'text-slate-400'}`}>
                        主页
                    </span>
                </div>
            </div>
            
             {/* Divider */}
             <div className="w-px h-6 md:w-16 md:h-px bg-slate-100 my-1 mx-auto relative z-20"></div>

        </div>

        {/* --- SCROLLABLE SECTION (Users) --- */}
        <div className="flex-1 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden w-full scrollbar-hide relative z-20">
             <div className="flex md:flex-col items-center min-w-max md:w-full">
                {users.map(u => {
                    const isSelected = viewMode === 'user' && currentUser.id === u.id;
                    
                    return (
                        <div 
                            key={u.id} 
                            onClick={() => switchToUser(u)}
                            className={`
                                relative w-full flex flex-col items-center group cursor-pointer transition-all duration-300 py-3 md:py-4 px-2
                                ${isSelected 
                                    ? themeBgClass + ' rounded-none z-10'
                                    : 'bg-white hover:bg-slate-50 z-10'}
                            `}
                        >
                            <button
                                ref={el => avatarRefs.current[u.id] = el}
                                className={`
                                    relative w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-3xl transition-all duration-300 flex-shrink-0
                                    ${u.color} text-white
                                    ${isSelected ? 'shadow-lg scale-105 ring-4 ring-white' : 'opacity-90 hover:opacity-100 scale-95'}
                                `}
                            >
                                {u.avatar}
                            </button>
                            <span className={`pt-1 text-[10px] font-bold truncate max-w-[60px] text-center transition-all duration-300 ${isSelected ? themeTextClass : 'text-slate-400'}`}>
                                {u.name}
                            </span>
                        </div>
                    );
                })}
                {/* Spacer */}
                <div className="w-4 md:h-24 flex-shrink-0"></div>
             </div>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <main className={`flex-1 relative flex flex-col transition-colors duration-500 ${viewMode === 'calendar' ? 'bg-white' : themeBgClass} overflow-hidden rounded-none shadow-none z-20 md:-ml-px -mt-px`}>
        
        {viewMode === 'calendar' ? (
            <CalendarView 
                currentDate={new Date(selectedDate)} 
                reminders={reminders}
                users={users}
                onSelectDate={(dateStr) => {
                    setSelectedDate(dateStr);
                    // Decide where to go back to (Home or keep current User?)
                    // Let's go to Home so we see everyone, or keep user if they were selected?
                    // Going Home is safer to see everything.
                    setViewMode('home');
                }}
                onClose={() => setViewMode('home')}
            />
        ) : (
            <>
            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 scrollbar-hide">
                <div className="max-w-2xl mx-auto">
                    {/* Date Navigation Header */}
                    <div className="flex justify-between items-end mb-8 sticky top-0 z-10 py-4 bg-inherit/95 backdrop-blur-sm border-b border-black/5">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-sm font-medium opacity-60">
                                <button onClick={() => changeDate(-1)} className="hover:bg-black/5 p-1 rounded"><i className="fa-solid fa-chevron-left"></i></button>
                                <span>{selectedDate}</span>
                                <button onClick={() => changeDate(1)} className="hover:bg-black/5 p-1 rounded"><i className="fa-solid fa-chevron-right"></i></button>
                                
                                {/* Calendar View Toggle */}
                                <button 
                                    onClick={() => setViewMode('calendar')}
                                    className="ml-2 w-7 h-7 flex items-center justify-center rounded bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors"
                                    title="日历视图"
                                >
                                    <i className="fa-solid fa-calendar-days text-sm"></i>
                                </button>

                                {selectedDate !== getTodayString() && (
                                    <button 
                                        onClick={() => setSelectedDate(getTodayString())}
                                        className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded ml-2"
                                    >
                                        回今天
                                    </button>
                                )}
                            </div>
                            <h2 className={`text-3xl font-bold ${themeTextClass}`}>
                                {viewMode === 'home' ? '今日家庭概览' : `${currentUser.name}的提醒`}
                            </h2>
                        </div>
                        <div className={`text-sm font-bold px-3 py-1 rounded-full bg-white/60 backdrop-blur-sm shadow-sm ${themeTextClass}`}>
                            {displayedReminders.filter(r => !r.isCompleted).length} 待办
                        </div>
                    </div>

                    {displayedReminders.length === 0 ? (
                        <div className="text-center py-20 bg-white/40 backdrop-blur-sm rounded-3xl border-2 border-dashed border-white/50">
                            <div className="text-6xl mb-4 opacity-50 animate-bounce">
                                {viewMode === 'home' ? '🏠' : currentUser.avatar}
                            </div>
                            <p className={`text-xl font-bold ${themeTextClass} opacity-60`}>
                                该日期没有安排
                            </p>
                            <p className="text-sm text-slate-500 mt-2 opacity-70">点击下方添加</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                        {displayedReminders.map((reminder) => {
                            const rUser = users.find(u => u.id === reminder.userId) || users[0];
                            return (
                                <div 
                                    key={reminder.id}
                                    className={`group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 ${
                                        reminder.isCompleted 
                                        ? 'bg-slate-100/60 border border-transparent opacity-60' 
                                        : 'bg-white shadow-lg shadow-slate-200/20 border border-white hover:shadow-xl hover:scale-[1.01]'
                                    }`}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Check Button */}
                                        <button 
                                            onClick={() => toggleComplete(reminder.id)}
                                            className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                                reminder.isCompleted 
                                                ? 'bg-green-500 border-green-500 text-white' 
                                                : `border-slate-300 text-transparent hover:border-slate-400`
                                            }`}
                                        >
                                            <i className="fa-solid fa-check text-sm"></i>
                                        </button>
                                        
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div className="flex flex-col">
                                                    {/* In Home mode, show who the task belongs to */}
                                                    {viewMode === 'home' && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${rUser.color} text-white font-bold`}>
                                                                {rUser.avatar} {rUser.name}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className={`font-bold text-lg leading-snug mr-2 ${reminder.isCompleted ? 'text-slate-600 decoration-slate-500 decoration-2 line-through' : 'text-slate-800'}`}>
                                                        {reminder.title}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                                    {/* Edit Button */}
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => handleEditClick(e, reminder)}
                                                        className="w-10 h-10 flex items-center justify-center rounded-full text-black/80 hover:text-blue-600 hover:bg-blue-50 transition-colors pointer-events-auto relative z-20"
                                                        title="修改"
                                                    >
                                                        <i className="fa-solid fa-pencil text-sm pointer-events-none"></i>
                                                    </button>
                                                    {/* Delete Button */}
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => requestDeleteReminder(e, reminder.id)}
                                                        className="w-10 h-10 flex items-center justify-center rounded-full text-black/80 hover:text-red-600 hover:bg-red-50 transition-colors pointer-events-auto relative z-20"
                                                        title="删除"
                                                    >
                                                        <i className="fa-solid fa-trash-can text-sm pointer-events-none"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center justify-between mt-2">
                                                <div className="flex items-center gap-2">
                                                    {reminder.type === 'medication' && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold">
                                                            <i className="fa-solid fa-capsules"></i> 用药
                                                        </span>
                                                    )}
                                                    {reminder.type === 'activity' && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-100 text-yellow-700 text-xs font-bold">
                                                            <i className="fa-solid fa-person-running"></i> 活动
                                                        </span>
                                                    )}
                                                    {reminder.type === 'general' && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">
                                                            <i className="fa-regular fa-note-sticky"></i> 常规
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`text-2xl font-mono font-bold tracking-tight ${reminder.isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                                                    {reminder.time}
                                                </span>
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

            {/* Voice Input Component */}
            <VoiceInput 
                currentUser={voiceContextUser} 
                users={users}
                onAddReminder={handleSaveReminder}
                onManualInput={handleOpenManualModal}
                voiceSettings={voiceSettings}
                aiSettings={aiSettings}
            />
            </>
        )}
      </main>
    </div>
  );
};

// Wrap main app in error boundary
const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
};

export default App;
