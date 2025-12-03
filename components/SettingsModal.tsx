
import React, { useState, useEffect, useRef } from 'react';
import { User, VoiceSettings, AISettings, AIProvider, Reminder, CloudSettings } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { createCloudBackup, updateCloudBackup, fetchCloudBackup } from '../services/cloudService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  setUsers: (users: User[]) => void;
  voiceSettings: VoiceSettings;
  setVoiceSettings: (settings: VoiceSettings) => void;
  aiSettings: AISettings;
  setAiSettings: (settings: AISettings) => void;
  reminders: Reminder[];
  setReminders: (reminders: Reminder[]) => void;
  cloudSettings: CloudSettings;
  setCloudSettings: (settings: CloudSettings) => void;
}

const AVATAR_OPTIONS = ['👴', '👵', '👨', '👩', '👶', '👦', '👧', '👱', '👱‍♀️', '😺', '🐶', '🤖', '👾'];
const COLOR_OPTIONS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 
  'bg-yellow-500', 'bg-purple-500', 'bg-cyan-500', 'bg-orange-500', 'bg-slate-500'
];

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  users, 
  setUsers,
  voiceSettings,
  setVoiceSettings,
  aiSettings,
  setAiSettings,
  reminders,
  setReminders,
  cloudSettings,
  setCloudSettings
}) => {
  const [activeTab, setActiveTab] = useState<'family' | 'voice' | 'ai' | 'data' | 'cloud'>('family');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Local state to track which user ID is pending deletion confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Auto Backup timestamp state
  const [autoBackupTime, setAutoBackupTime] = useState<string | null>(null);
  // Cloud Sync state
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load voices safely
  useEffect(() => {
    const loadVoices = () => {
      // STRICT CHECK: Ensure synthesis exists and is valid
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      
      const voices = window.speechSynthesis.getVoices();
      const zhVoices = voices.filter(v => v.lang.includes('zh') || v.lang.includes('CN'));
      setAvailableVoices(zhVoices.length > 0 ? zhVoices : voices);
    };

    if (typeof window !== 'undefined' && window.speechSynthesis) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { 
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = null; 
        }
    };
  }, []);

  // Check auto-backup existence when tab changes or opens
  useEffect(() => {
      if (activeTab === 'data' && isOpen) {
          try {
              const saved = localStorage.getItem('family_auto_backup');
              if (saved) {
                  const parsed = JSON.parse(saved);
                  if (parsed.backupTime) {
                      const d = new Date(parsed.backupTime);
                      setAutoBackupTime(d.toLocaleString());
                  }
              }
          } catch (e) { console.error(e); }
      }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  // --- Family Handlers ---
  const handleUpdateUser = (id: string, field: keyof User, value: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const handleAddUser = () => {
    const newUser: User = {
      id: uuidv4(),
      name: '新成员',
      avatar: '😊',
      color: 'bg-slate-500'
    };
    setUsers([...users, newUser]);
  };

  const handleRequestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (users.length <= 1) {
      alert("至少保留一位家庭成员");
      return;
    }
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId) {
       setUsers(users.filter(u => u.id !== confirmDeleteId));
       setConfirmDeleteId(null);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  // --- Voice Handlers ---
  const handleTestVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        alert("您的浏览器不支持语音功能 (TTS)。");
        return;
    }

    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance("你好，我是家庭智能助手，这是我的声音。");
    msg.lang = 'zh-CN';
    msg.pitch = voiceSettings.pitch;
    msg.rate = voiceSettings.rate;
    msg.volume = voiceSettings.volume;
    if (voiceSettings.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI);
      if (voice) msg.voice = voice;
    }
    window.speechSynthesis.speak(msg);
  };

  // --- AI Handlers ---
  const handleProviderChange = (provider: AIProvider) => {
      setAiSettings({ ...aiSettings, activeProvider: provider });
  };

  // Helper to update specific config fields for the active provider
  const updateAiConfig = (field: 'apiKey' | 'baseUrl' | 'model', value: string) => {
      const active = aiSettings.activeProvider;
      // SAFE ACCESS: Ensure configs exists
      const currentConfigs = aiSettings.configs;
      const activeConfig = currentConfigs[active] || {};

      setAiSettings({
          ...aiSettings,
          configs: {
              ...currentConfigs,
              [active]: {
                  ...activeConfig,
                  [field]: value
              }
          }
      });
  };

  // --- Data Handlers ---
  const handleExportData = () => {
    const data = {
        users,
        reminders,
        voiceSettings,
        aiSettings,
        exportDate: new Date().toISOString(),
        version: "1.0"
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FamilyMinder_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string);
            if (json.users && Array.isArray(json.users)) setUsers(json.users);
            if (json.reminders && Array.isArray(json.reminders)) setReminders(json.reminders);
            if (json.voiceSettings) setVoiceSettings(json.voiceSettings);
            if (json.aiSettings) setAiSettings(json.aiSettings);
            alert("数据恢复成功！");
        } catch (err) {
            alert("文件格式错误，无法恢复。");
            console.error(err);
        }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRestoreAutoBackup = () => {
      if (!confirm("确定要恢复到最近一次自动备份的状态吗？当前未保存的修改可能会丢失。")) return;
      
      try {
          const saved = localStorage.getItem('family_auto_backup');
          if (saved) {
            const json = JSON.parse(saved);
            if (json.users && Array.isArray(json.users)) setUsers(json.users);
            if (json.reminders && Array.isArray(json.reminders)) setReminders(json.reminders);
            if (json.voiceSettings) setVoiceSettings(json.voiceSettings);
            if (json.aiSettings) setAiSettings(json.aiSettings);
            alert(`已恢复到: ${new Date(json.backupTime).toLocaleString()}`);
          } else {
              alert("未找到自动备份数据。");
          }
      } catch (e) {
          alert("恢复失败，备份数据可能已损坏。");
      }
  };

  const handleResetData = () => {
    if (confirm("确定要清空所有数据并恢复出厂设置吗？此操作无法撤销。")) {
        localStorage.clear();
        window.location.reload();
    }
  };

  // --- Cloud Sync Handlers ---
  const handleCloudSync = async () => {
      if (!cloudSettings.apiKey) {
          alert("请先填入 JSONBin 的 Access Key");
          return;
      }
      setIsCloudSyncing(true);
      try {
          const data = {
              users,
              reminders,
              voiceSettings,
              aiSettings,
              version: "1.0",
              lastUpdated: new Date().toISOString()
          };
          if (cloudSettings.binId) {
              await updateCloudBackup(cloudSettings.apiKey, cloudSettings.binId, data);
              alert("云端数据更新成功！");
          } else {
              const binId = await createCloudBackup(cloudSettings.apiKey, data);
              setCloudSettings({ ...cloudSettings, binId });
              alert("云端备份创建成功！Bin ID 已保存。");
          }
      } catch (e: any) {
          alert(`同步失败: ${e.message}`);
      } finally {
          setIsCloudSyncing(false);
      }
  };

  const handleCloudRestore = async () => {
      if (!cloudSettings.apiKey || !cloudSettings.binId) {
          alert("请填入 Key 和 Bin ID");
          return;
      }
      if (!confirm("确定从云端恢复吗？这将覆盖当前本地数据。")) return;

      setIsCloudSyncing(true);
      try {
          const data = await fetchCloudBackup(cloudSettings.apiKey, cloudSettings.binId);
          if (data.users && Array.isArray(data.users)) setUsers(data.users);
          if (data.reminders && Array.isArray(data.reminders)) setReminders(data.reminders);
          if (data.voiceSettings) setVoiceSettings(data.voiceSettings);
          if (data.aiSettings) setAiSettings(data.aiSettings);
          alert(`恢复成功！最后更新: ${new Date(data.lastUpdated).toLocaleString()}`);
      } catch (e: any) {
          alert(`恢复失败: ${e.message}`);
      } finally {
          setIsCloudSyncing(false);
      }
  };
  
  // Safe access with fallback to prevent crashes if data is malformed
  const currentConfig = aiSettings?.configs?.[aiSettings?.activeProvider] || aiSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800">设置</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fa-solid fa-times text-xl"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0 overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveTab('family')}
            className={`flex-1 min-w-[80px] py-3 text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'family' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            家庭成员
          </button>
          <button 
            onClick={() => setActiveTab('voice')}
            className={`flex-1 min-w-[80px] py-3 text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'voice' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            语音
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={`flex-1 min-w-[80px] py-3 text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            AI 配置
          </button>
          <button 
            onClick={() => setActiveTab('data')}
            className={`flex-1 min-w-[80px] py-3 text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'data' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            数据
          </button>
          <button 
            onClick={() => setActiveTab('cloud')}
            className={`flex-1 min-w-[80px] py-3 text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'cloud' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            云同步
          </button>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          
          {activeTab === 'family' && (
            <div className="space-y-4">
              {users.map(user => (
                <div key={user.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3 relative overflow-hidden">
                  
                  {/* Normal User Row Content */}
                  {confirmDeleteId !== user.id ? (
                    <>
                      <div className="relative group flex-shrink-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${user.color} text-white cursor-pointer`}>
                          {user.avatar}
                        </div>
                        <select 
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            value={user.avatar}
                            onChange={(e) => handleUpdateUser(user.id, 'avatar', e.target.value)}
                        >
                            {AVATAR_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>

                      <div className="flex-1 space-y-2 min-w-0">
                        <input 
                          type="text" 
                          value={user.name}
                          onChange={(e) => handleUpdateUser(user.id, 'name', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 focus:border-blue-500 outline-none"
                        />
                        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-1">
                          {COLOR_OPTIONS.map(c => (
                            <button
                              key={c}
                              onClick={() => handleUpdateUser(user.id, 'color', c)}
                              className={`w-5 h-5 rounded-full flex-shrink-0 ${c} ${user.color === c ? 'ring-2 ring-slate-400 ring-offset-1' : ''}`}
                            />
                          ))}
                        </div>
                      </div>

                      <button 
                        type="button"
                        onClick={(e) => handleRequestDelete(e, user.id)}
                        className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10"
                        title="删除成员"
                      >
                        <i className="fa-solid fa-trash-can pointer-events-none"></i>
                      </button>
                    </>
                  ) : (
                    /* Delete Confirmation Overlay inside the row */
                    <div className="absolute inset-0 bg-red-50 z-20 flex items-center justify-between px-4 animate-fade-in">
                      <span className="text-sm font-bold text-red-700">确定删除?</span>
                      <div className="flex gap-2">
                         <button 
                           onClick={handleCancelDelete}
                           className="px-3 py-1.5 rounded-lg bg-white border border-red-100 text-slate-500 text-xs font-bold"
                         >
                           取消
                         </button>
                         <button 
                           onClick={handleConfirmDelete}
                           className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold shadow-sm"
                         >
                           确认
                         </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button 
                onClick={handleAddUser}
                className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl font-bold hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-plus"></i> 添加新成员
              </button>
            </div>
          )}

          {activeTab === 'voice' && (
            <div className="space-y-6">
              
              <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-700">
                <i className="fa-solid fa-info-circle mr-2"></i>
                提示：语音效果取决于您当前使用的浏览器和操作系统。
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">选择声音</label>
                <select 
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  value={voiceSettings.voiceURI || ''}
                  onChange={(e) => setVoiceSettings({...voiceSettings, voiceURI: e.target.value})}
                  disabled={availableVoices.length === 0}
                >
                   {availableVoices.length === 0 && <option value="">默认声音 (不支持选择)</option>}
                   {availableVoices.map(v => (
                     <option key={v.voiceURI} value={v.voiceURI}>
                       {v.name} ({v.lang})
                     </option>
                   ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                   <label className="text-sm font-medium text-slate-700">语速 (Rate)</label>
                   <span className="text-xs text-slate-500">{voiceSettings.rate.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2" step="0.1" 
                  value={voiceSettings.rate}
                  onChange={(e) => setVoiceSettings({...voiceSettings, rate: parseFloat(e.target.value)})}
                  className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>慢</span>
                  <span>快</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                   <label className="text-sm font-medium text-slate-700">音调 (Pitch)</label>
                   <span className="text-xs text-slate-500">{voiceSettings.pitch.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2" step="0.1" 
                  value={voiceSettings.pitch}
                  onChange={(e) => setVoiceSettings({...voiceSettings, pitch: parseFloat(e.target.value)})}
                  className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>低沉</span>
                  <span>尖细</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button 
                  onClick={handleTestVoice}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-play"></i> 测试声音
                </button>
              </div>

            </div>
          )}

          {activeTab === 'ai' && (
             <div className="space-y-6">
                 <div className="bg-yellow-50 p-4 rounded-xl text-sm text-yellow-800">
                     <i className="fa-solid fa-lightbulb mr-2"></i>
                     设置 AI 才能使用语音智能解析功能。
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">AI 服务提供商</label>
                     <div className="grid grid-cols-2 gap-3">
                         <button
                             onClick={() => handleProviderChange('gemini')}
                             className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${aiSettings.activeProvider === 'gemini' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                         >
                             <span className="font-bold">Google</span>
                             <span className="text-[10px]">海外 (Gemini)</span>
                         </button>
                         <button
                             onClick={() => handleProviderChange('deepseek')}
                             className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${aiSettings.activeProvider === 'deepseek' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                         >
                             <span className="font-bold">DeepSeek</span>
                             <span className="text-[10px]">国内 (V3/R1)</span>
                         </button>
                         <button
                             onClick={() => handleProviderChange('moonshot')}
                             className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${aiSettings.activeProvider === 'moonshot' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                         >
                             <span className="font-bold">Kimi</span>
                             <span className="text-[10px]">Moonshot</span>
                         </button>
                         <button
                             onClick={() => handleProviderChange('siliconflow')}
                             className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 relative ${aiSettings.activeProvider === 'siliconflow' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                         >
                             <div className="absolute top-1 right-1 bg-green-500 text-white text-[9px] px-1 rounded font-bold">免费</div>
                             <span className="font-bold">硅基流动</span>
                             <span className="text-[10px]">Qwen/GLM</span>
                         </button>
                         <button
                             onClick={() => handleProviderChange('custom')}
                             className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 col-span-2 ${aiSettings.activeProvider === 'custom' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                         >
                             <span className="font-bold">Custom (Ollama/其他)</span>
                             <span className="text-[10px]">OpenAI 兼容接口</span>
                         </button>
                     </div>
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">API Key ({aiSettings.activeProvider})</label>
                     <input
                         type="password"
                         value={currentConfig.apiKey || ''}
                         onChange={(e) => updateAiConfig('apiKey', e.target.value)}
                         placeholder={aiSettings.activeProvider === 'custom' ? "本地服务可为空" : "输入您的 API Key"}
                         className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                     />
                     <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-2">
                         {aiSettings.activeProvider === 'gemini' && <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500">获取 Google API Key</a>}
                         {aiSettings.activeProvider === 'deepseek' && <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500">获取 DeepSeek Key</a>}
                         {aiSettings.activeProvider === 'moonshot' && <a href="https://platform.moonshot.cn/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500">获取 Moonshot Key</a>}
                         {aiSettings.activeProvider === 'siliconflow' && <a href="https://cloud.siliconflow.cn/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500">获取硅基流动 Key (含免费)</a>}
                     </div>
                 </div>
                 
                 {aiSettings.activeProvider !== 'gemini' && (
                    <div className="animate-fade-in space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Base URL (API 地址)</label>
                            <input
                                type="text"
                                value={currentConfig.baseUrl || ''}
                                onChange={(e) => updateAiConfig('baseUrl', e.target.value)}
                                placeholder="https://..."
                                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-mono"
                            />
                        </div>
                         <div>
                             <label className="block text-sm font-medium text-slate-700 mb-2">Model (模型名称)</label>
                             <input
                                 type="text"
                                 value={currentConfig.model || ''}
                                 onChange={(e) => updateAiConfig('model', e.target.value)}
                                 placeholder="e.g. gpt-3.5-turbo"
                                 className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-mono"
                             />
                         </div>
                    </div>
                 )}
             </div>
          )}

          {activeTab === 'data' && (
             <div className="space-y-6 animate-fade-in">
                 <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600">
                     <i className="fa-solid fa-database mr-2"></i>
                     您的数据存储在本地浏览器中。为了防止数据丢失（如清除缓存），建议定期手动备份。
                     <br/><br/>
                     <span className="font-bold">自动备份系统：</span>
                     应用会在每次数据变更时自动创建快照。
                 </div>

                 <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                     <div>
                         <div className="text-sm font-bold text-indigo-900">上次自动备份时间</div>
                         <div className="text-xs text-indigo-600 mt-0.5">
                             {autoBackupTime || "暂无备份"}
                         </div>
                     </div>
                     <button
                         onClick={handleRestoreAutoBackup}
                         disabled={!autoBackupTime}
                         className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white rounded-lg text-sm font-bold shadow-sm"
                     >
                         一键恢复
                     </button>
                 </div>

                 <div className="space-y-3 pt-2">
                     <button
                         onClick={handleExportData}
                         className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
                     >
                         <i className="fa-solid fa-download text-xl"></i>
                         <div className="text-left">
                             <div className="text-base">手动备份 (导出)</div>
                             <div className="text-xs opacity-80 font-normal">下载 .json 文件到本地</div>
                         </div>
                     </button>

                     <div className="relative">
                         <input
                             type="file"
                             ref={fileInputRef}
                             onChange={handleImportData}
                             accept=".json"
                             className="hidden"
                         />
                         <button
                             onClick={() => fileInputRef.current?.click()}
                             className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
                         >
                             <i className="fa-solid fa-upload text-xl"></i>
                             <div className="text-left">
                                 <div className="text-base">恢复数据 (导入)</div>
                                 <div className="text-xs opacity-80 font-normal">从 .json 文件恢复</div>
                             </div>
                         </button>
                     </div>
                 </div>

                 <div className="pt-6 border-t border-slate-100 mt-4">
                     <button
                         onClick={handleResetData}
                         className="w-full py-3 border-2 border-red-100 text-red-500 hover:bg-red-50 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                     >
                         <i className="fa-solid fa-triangle-exclamation"></i>
                         重置所有数据
                     </button>
                 </div>
             </div>
          )}

          {activeTab === 'cloud' && (
             <div className="space-y-6 animate-fade-in">
                 <div className="bg-purple-50 p-4 rounded-xl text-sm text-purple-700">
                     <i className="fa-solid fa-cloud mr-2"></i>
                     通过 JSONBin.io 实现跨设备同步。建议使用 Access Key 以提高安全性。
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">Access API Key</label>
                     <input
                         type="password"
                         value={cloudSettings.apiKey}
                         onChange={(e) => setCloudSettings({ ...cloudSettings, apiKey: e.target.value })}
                         placeholder="JSONBin Access Key"
                         className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                     />
                     <div className="mt-1 text-xs text-slate-400">
                         <a href="https://jsonbin.io/app/app/api-keys" target="_blank" rel="noreferrer" className="underline hover:text-blue-500">获取 Access Key</a>
                     </div>
                 </div>

                 <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">Bin ID (备份ID)</label>
                     <input
                         type="text"
                         value={cloudSettings.binId}
                         onChange={(e) => setCloudSettings({ ...cloudSettings, binId: e.target.value })}
                         placeholder="同步后自动生成，或手动填入以恢复"
                         className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono text-sm"
                     />
                 </div>

                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                     <div className="flex items-center justify-between">
                         <span className="text-sm font-bold text-slate-700">自动同步</span>
                         <button 
                             onClick={() => setCloudSettings({ ...cloudSettings, autoSyncEnabled: !cloudSettings.autoSyncEnabled })}
                             className={`w-12 h-6 rounded-full transition-colors relative ${cloudSettings.autoSyncEnabled ? 'bg-purple-600' : 'bg-slate-300'}`}
                         >
                             <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${cloudSettings.autoSyncEnabled ? 'left-7' : 'left-1'}`}></div>
                         </button>
                     </div>
                     
                     {cloudSettings.autoSyncEnabled && (
                         <div>
                             <label className="block text-xs font-medium text-slate-500 mb-1">同步频率</label>
                             <select
                                value={cloudSettings.autoSyncInterval}
                                onChange={(e) => setCloudSettings({ ...cloudSettings, autoSyncInterval: Number(e.target.value) })}
                                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                             >
                                 <option value={60}>每 1 小时 (推荐)</option>
                                 <option value={240}>每 4 小时</option>
                                 <option value={720}>每 12 小时</option>
                                 <option value={1440}>每天一次</option>
                             </select>
                             <p className="text-[10px] text-slate-400 mt-1">
                                 上次自动同步: {cloudSettings.lastAutoSync ? new Date(cloudSettings.lastAutoSync).toLocaleString() : '暂无'}
                             </p>
                         </div>
                     )}
                 </div>

                 <div className="pt-4 flex gap-3">
                     <button
                         onClick={handleCloudSync}
                         disabled={isCloudSyncing}
                         className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2"
                     >
                         {isCloudSyncing ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                         {cloudSettings.binId ? '立即更新备份' : '创建云端备份'}
                     </button>

                     <button
                         onClick={handleCloudRestore}
                         disabled={isCloudSyncing}
                         className="flex-1 py-3 bg-white border-2 border-purple-100 text-purple-600 hover:bg-purple-50 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                     >
                         {isCloudSyncing ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-cloud-arrow-down"></i>}
                         从云端恢复
                     </button>
                 </div>
             </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
