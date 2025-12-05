
import React, { useState, useEffect, useRef } from 'react';
import { User, VoiceSettings, AISettings, AIProvider, Reminder, CloudSettings, ReminderTypeDefinition } from '../types';
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
  reminderTypes: ReminderTypeDefinition[];
  setReminderTypes: (types: ReminderTypeDefinition[]) => void;
  initialTab?: string;
}

const AVATAR_OPTIONS = ['👴', '👵', '👨', '👩', '👶', '👦', '👧', '👱', '👱‍♀️', '😺', '🐶', '🤖', '👾'];
const COLOR_OPTIONS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 
  'bg-yellow-500', 'bg-purple-500', 'bg-cyan-500', 'bg-orange-500', 'bg-slate-500'
];
const ICON_OPTIONS = ['capsules', 'person-running', 'note-sticky', 'utensils', 'cart-shopping', 'heart', 'briefcase', 'book', 'car', 'plane'];

const PROVIDER_LINKS: Record<string, string> = {
    gemini: 'https://aistudiocdn.com/apikey', // Official Google AI Studio
    deepseek: 'https://platform.deepseek.com/api_keys',
    moonshot: 'https://platform.moonshot.cn/console/api-keys',
    siliconflow: 'https://cloud.siliconflow.cn/account/ak',
    openai: 'https://platform.openai.com/api-keys'
};

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
  setCloudSettings,
  reminderTypes,
  setReminderTypes,
  initialTab
}) => {
  const [activeTab, setActiveTab] = useState<'family' | 'types' | 'voice' | 'ai' | 'data' | 'cloud'>('family');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [autoBackupTime, setAutoBackupTime] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (isOpen && initialTab) {
          setActiveTab(initialTab as any);
      }
  }, [isOpen, initialTab]);

  const loadVoices = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const zhVoices = voices.filter(v => v.lang.includes('zh') || v.lang.includes('CN'));
    setAvailableVoices(zhVoices.length > 0 ? zhVoices : voices);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis && 'speechSynthesis' in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { if (typeof window !== 'undefined' && window.speechSynthesis && 'speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  useEffect(() => {
      if (activeTab === 'data' && isOpen) {
          try {
              const saved = localStorage.getItem('family_auto_backup');
              if (saved) {
                  const parsed = JSON.parse(saved);
                  if (parsed.backupTime) setAutoBackupTime(new Date(parsed.backupTime).toLocaleString());
              }
          } catch (e) {}
      }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const handleUpdateUser = (id: string, field: keyof User, value: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const handleAddUser = () => {
    setUsers([...users, { id: uuidv4(), name: '新成员', avatar: '😊', color: 'bg-slate-500' }]);
  };

  const handleUpdateType = (id: string, field: keyof ReminderTypeDefinition, value: string) => {
    setReminderTypes(reminderTypes.map(t => t.id === id ? { ...t, [field]: value } : t));
  };
  
  const handleAddType = () => {
      setReminderTypes([...reminderTypes, { id: uuidv4(), label: '新类型', icon: 'note-sticky', color: 'bg-blue-500' }]);
  };

  const handleDeleteType = (id: string) => {
      if (reminderTypes.length <= 1) { alert("至少保留一个类型"); return; }
      if (confirm("删除类型不会删除已有的提醒，确定吗？")) {
          setReminderTypes(reminderTypes.filter(t => t.id !== id));
      }
  };

  const handleRequestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (users.length <= 1) { alert("至少保留一位"); return; }
    setConfirmDeleteId(id);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId) { setUsers(users.filter(u => u.id !== confirmDeleteId)); setConfirmDeleteId(null); }
  };

  const handleTestVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance("测试语音");
    msg.lang = 'zh-CN';
    msg.pitch = voiceSettings.pitch;
    msg.rate = voiceSettings.rate;
    if (voiceSettings.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === voiceSettings.voiceURI);
      if (voice) msg.voice = voice;
    }
    window.speechSynthesis.speak(msg);
  };

  const handleProviderChange = (provider: AIProvider) => {
      setAiSettings({ ...aiSettings, activeProvider: provider });
  };

  const updateAiConfig = (field: 'apiKey' | 'baseUrl' | 'model', value: string) => {
      const active = aiSettings.activeProvider;
      const currentConfigs = aiSettings.configs;
      const activeConfig = currentConfigs[active] || {};
      setAiSettings({ ...aiSettings, configs: { ...currentConfigs, [active]: { ...activeConfig, [field]: value } } });
  };

  const handleExportData = () => {
    const data = { users, reminders, voiceSettings, aiSettings, reminderTypes, exportDate: new Date().toISOString(), version: "1.1" };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string);
            if (json.users) setUsers(json.users);
            if (json.reminders) setReminders(json.reminders);
            if (json.voiceSettings) setVoiceSettings(json.voiceSettings);
            if (json.aiSettings) setAiSettings(json.aiSettings);
            if (json.reminderTypes) setReminderTypes(json.reminderTypes);
            alert("恢复成功");
        } catch (err) { alert("格式错误"); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetData = () => {
    if (confirm("确定重置？")) { localStorage.clear(); window.location.reload(); }
  };

  const handleRestoreAutoBackup = () => {
    try {
        const saved = localStorage.getItem('family_auto_backup');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.users) setUsers(parsed.users);
            if (parsed.reminders) setReminders(parsed.reminders);
            if (parsed.voiceSettings) setVoiceSettings(parsed.voiceSettings);
            if (parsed.aiSettings) setAiSettings(parsed.aiSettings);
            if (parsed.reminderTypes) setReminderTypes(parsed.reminderTypes);
            alert("恢复成功");
        } else {
            alert("无自动备份");
        }
    } catch (err) { alert("恢复失败"); }
  };

  const handleCloudSync = async () => {
      if (!cloudSettings.apiKey) { alert("无 Key"); return; }
      setIsCloudSyncing(true);
      try {
          const data = { users, reminders, voiceSettings, aiSettings, reminderTypes, version: "1.1", lastUpdated: new Date().toISOString() };
          if (cloudSettings.binId) {
              await updateCloudBackup(cloudSettings.apiKey, cloudSettings.binId, data);
              alert("更新成功");
          } else {
              const binId = await createCloudBackup(cloudSettings.apiKey, data);
              setCloudSettings({ ...cloudSettings, binId });
              alert("创建成功");
          }
      } catch (e: any) { alert(`失败: ${e.message}`); } finally { setIsCloudSyncing(false); }
  };

  const handleCloudRestore = async () => {
      if (!cloudSettings.apiKey || !cloudSettings.binId) { alert("缺信息"); return; }
      if (!confirm("确定覆盖？")) return;
      setIsCloudSyncing(true);
      try {
          const data = await fetchCloudBackup(cloudSettings.apiKey, cloudSettings.binId);
          if (data.users) setUsers(data.users);
          if (data.reminders) setReminders(data.reminders);
          if (data.voiceSettings) setVoiceSettings(data.voiceSettings);
          if (data.aiSettings) setAiSettings(data.aiSettings);
          if (data.reminderTypes) setReminderTypes(data.reminderTypes);
          alert("恢复成功");
      } catch (e: any) { alert(`失败: ${e.message}`); } finally { setIsCloudSyncing(false); }
  };
  
  const currentConfig = aiSettings?.configs?.[aiSettings?.activeProvider] || aiSettings?.configs?.gemini || { apiKey: '', baseUrl: '', model: '' };
  
  // Safe default fallback
  if (!currentConfig.apiKey) currentConfig.apiKey = '';
  if (!currentConfig.baseUrl) currentConfig.baseUrl = '';
  if (!currentConfig.model) currentConfig.model = '';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 landscape:p-0 animate-fade-in">
      <div className="bg-white rounded-3xl landscape:rounded-none w-full max-w-lg landscape:max-w-none landscape:w-full landscape:h-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] landscape:max-h-full">
        
        <div className="bg-slate-50 px-6 landscape:px-4 py-4 landscape:py-2 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800">设置</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fa-solid fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex border-b border-slate-100 flex-shrink-0 overflow-x-auto scrollbar-hide">
          {['family', 'types', 'voice', 'ai', 'data', 'cloud'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 min-w-[60px] py-3 landscape:py-2 text-sm font-bold whitespace-nowrap ${activeTab === tab ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500'}`}>
                {{'family':'成员', 'types': '类型', 'voice':'语音', 'ai':'AI', 'data':'数据', 'cloud':'云'}[tab]}
              </button>
          ))}
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 landscape:p-4 scrollbar-hide">
          {activeTab === 'family' && (
            <div className="space-y-4 landscape:grid landscape:grid-cols-2 landscape:gap-4 landscape:space-y-0">
              {users.map(user => (
                <div key={user.id} className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center gap-2 relative overflow-hidden">
                  {confirmDeleteId !== user.id ? (
                    <>
                      <div className="relative group flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl cursor-pointer" style={{ backgroundColor: user.color.replace('bg-', '') }}>
                        {user.avatar}
                        <select className="absolute inset-0 opacity-0 cursor-pointer" value={user.avatar} onChange={(e) => handleUpdateUser(user.id, 'avatar', e.target.value)}>
                            {AVATAR_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <input type="text" value={user.name} onChange={(e) => handleUpdateUser(user.id, 'name', e.target.value)} className="w-full bg-white border border-slate-200 rounded px-2 py-0.5 text-sm font-bold" />
                        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                          {COLOR_OPTIONS.map(c => <button key={c} onClick={() => handleUpdateUser(user.id, 'color', c)} className={`w-4 h-4 rounded-full flex-shrink-0 ${c}`} />)}
                        </div>
                      </div>
                      <button onClick={(e) => handleRequestDelete(e, user.id)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500"><i className="fa-solid fa-trash-can"></i></button>
                    </>
                  ) : (
                    <div className="absolute inset-0 bg-red-50 z-20 flex items-center justify-between px-2">
                      <span className="text-xs font-bold text-red-700">删除?</span>
                      <div className="flex gap-1"><button onClick={handleCancelDelete} className="px-2 py-1 bg-white border text-xs">否</button><button onClick={handleConfirmDelete} className="px-2 py-1 bg-red-500 text-white text-xs">是</button></div>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={handleAddUser} className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"><i className="fa-solid fa-plus"></i> 添加</button>
            </div>
          )}

          {activeTab === 'types' && (
              <div className="space-y-4 landscape:grid landscape:grid-cols-2 landscape:gap-4 landscape:space-y-0">
                  {reminderTypes.map(t => (
                      <div key={t.id} className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 relative ${t.color}`}>
                                 <i className={`fa-solid fa-${t.icon} text-xs`}></i>
                                 <select className="absolute inset-0 opacity-0 cursor-pointer" value={t.icon} onChange={(e) => handleUpdateType(t.id, 'icon', e.target.value)}>
                                     {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                                 </select>
                             </div>
                             <input type="text" value={t.label} onChange={(e) => handleUpdateType(t.id, 'label', e.target.value)} className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-sm font-bold" />
                             <button onClick={() => handleDeleteType(t.id)} className="text-slate-400 hover:text-red-500 px-2"><i className="fa-solid fa-trash-can"></i></button>
                          </div>
                          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                              {COLOR_OPTIONS.map(c => <button key={c} onClick={() => handleUpdateType(t.id, 'color', c)} className={`w-4 h-4 rounded-full flex-shrink-0 ${c} ${t.color === c ? 'ring-2 ring-slate-400' : ''}`} />)}
                          </div>
                      </div>
                  ))}
                  <button onClick={handleAddType} className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"><i className="fa-solid fa-plus"></i> 添加类型</button>
              </div>
          )}

          {activeTab === 'voice' && (
            <div className="space-y-4 landscape:space-y-2">
              <div className="flex gap-2">
                 <button onClick={() => setVoiceSettings({ ...voiceSettings, provider: 'web' })} className={`flex-1 py-2 rounded text-xs font-bold ${voiceSettings.provider !== 'openai' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>浏览器原生</button>
                 <button onClick={() => setVoiceSettings({ ...voiceSettings, provider: 'openai' })} className={`flex-1 py-2 rounded text-xs font-bold ${voiceSettings.provider === 'openai' ? 'bg-green-600 text-white' : 'bg-slate-100'}`}>OpenAI / 兼容</button>
              </div>
              {voiceSettings.provider !== 'openai' ? (
                <>
                  <div className="flex gap-2">
                      <select className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-sm" value={voiceSettings.voiceURI} onChange={(e) => setVoiceSettings({...voiceSettings, voiceURI: e.target.value})}>
                           {availableVoices.length === 0 && <option value="">默认</option>}
                           {availableVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                      </select>
                      <button onClick={loadVoices} className="px-3 bg-slate-100 rounded text-slate-500 hover:bg-slate-200"><i className="fa-solid fa-rotate"></i></button>
                  </div>
                  <div><label className="text-xs font-bold text-slate-500">语速 {voiceSettings.rate}</label><input type="range" min="0.5" max="2" step="0.1" value={voiceSettings.rate} onChange={(e) => setVoiceSettings({...voiceSettings, rate: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-200 rounded-lg"/></div>
                  <div><label className="text-xs font-bold text-slate-500">音调 {voiceSettings.pitch}</label><input type="range" min="0.5" max="2" step="0.1" value={voiceSettings.pitch} onChange={(e) => setVoiceSettings({...voiceSettings, pitch: parseFloat(e.target.value)})} className="w-full h-1 bg-slate-200 rounded-lg"/></div>
                </>
              ) : (
                <>
                   <div className="text-xs text-slate-500 mb-2 p-2 bg-blue-50 rounded">
                       使用 <b>AI 设置 - OpenAI</b> 中的 Key。
                       <br/>支持任何兼容 OpenAI TTS 协议的服务。
                   </div>
                   <div>
                       <label className="text-xs font-bold text-slate-500">Base URL (选填)</label>
                       <input 
                           type="text" 
                           placeholder="默认: https://api.openai.com/v1" 
                           value={voiceSettings.ttsBaseUrl || ''} 
                           onChange={(e) => setVoiceSettings({...voiceSettings, ttsBaseUrl: e.target.value})} 
                           className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm"
                       />
                       <p className="text-[10px] text-slate-400">如果使用中转服务或本地 TTS，请在此填入地址。</p>
                   </div>
                   <div>
                       <label className="text-xs font-bold text-slate-500">模型</label>
                       <input type="text" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={voiceSettings.model || 'tts-1'} onChange={(e) => setVoiceSettings({...voiceSettings, model: e.target.value})} placeholder="例如: tts-1" />
                   </div>
                   <div>
                       <label className="text-xs font-bold text-slate-500">音色 ID</label>
                       <input type="text" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm" value={voiceSettings.voiceURI || 'alloy'} onChange={(e) => setVoiceSettings({...voiceSettings, voiceURI: e.target.value})} placeholder="例如: alloy" />
                   </div>
                </>
              )}
              <button onClick={handleTestVoice} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">测试</button>
            </div>
          )}

          {activeTab === 'ai' && (
             <div className="space-y-4 landscape:grid landscape:grid-cols-2 landscape:gap-4 landscape:space-y-0">
                 <div className="col-span-2 flex flex-wrap gap-2">
                     {['gemini', 'deepseek', 'moonshot', 'siliconflow', 'openai', 'custom'].map((p: any) => (
                         <button key={p} onClick={() => handleProviderChange(p)} className={`p-2 rounded border text-xs font-bold ${aiSettings.activeProvider === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}>{p}</button>
                     ))}
                 </div>
                 
                 <div className="col-span-2">
                    {aiSettings.activeProvider !== 'gemini' && (
                        <>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-slate-500">API Key</label>
                                {PROVIDER_LINKS[aiSettings.activeProvider] && (
                                    <a href={PROVIDER_LINKS[aiSettings.activeProvider]} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 underline">
                                        获取 Key <i className="fa-solid fa-external-link-alt"></i>
                                    </a>
                                )}
                            </div>
                            <input type="password" value={currentConfig.apiKey} onChange={(e) => updateAiConfig('apiKey', e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded text-sm" />
                        </>
                    )}
                    {aiSettings.activeProvider === 'gemini' && (
                         <div className="text-xs text-slate-500 bg-blue-50 p-3 rounded border border-blue-100">
                             Gemini API Key 已通过环境变量配置 (process.env.API_KEY)。
                         </div>
                    )}
                </div>

                 {aiSettings.activeProvider !== 'gemini' && aiSettings.activeProvider !== 'openai' && (
                    <>
                    <div><label className="text-xs font-bold text-slate-500">Base URL</label><input type="text" value={currentConfig.baseUrl} onChange={(e) => updateAiConfig('baseUrl', e.target.value)} className="w-full p-2 border rounded text-xs" /></div>
                    <div><label className="text-xs font-bold text-slate-500">Model</label><input type="text" value={currentConfig.model} onChange={(e) => updateAiConfig('model', e.target.value)} className="w-full p-2 border rounded text-xs" /></div>
                    </>
                 )}
                 {aiSettings.activeProvider === 'openai' && (
                    <div className="text-xs text-slate-500 col-span-2">此 Key 可同时用于 AI 对话 和 TTS 语音合成。</div>
                 )}
             </div>
          )}

          {activeTab === 'data' && (
             <div className="space-y-4">
                 <div className="text-xs text-slate-500">上次自动备份: {autoBackupTime || "无"}</div>
                 <button onClick={handleRestoreAutoBackup} disabled={!autoBackupTime} className="w-full py-2 bg-indigo-500 disabled:bg-indigo-300 text-white rounded font-bold text-sm">恢复自动备份</button>
                 <div className="grid grid-cols-2 gap-2">
                     <button onClick={handleExportData} className="py-2 bg-emerald-500 text-white rounded font-bold text-sm">导出</button>
                     <div className="relative"><input type="file" ref={fileInputRef} onChange={handleImportData} className="hidden" /><button onClick={() => fileInputRef.current?.click()} className="w-full py-2 bg-blue-500 text-white rounded font-bold text-sm">导入</button></div>
                 </div>
                 <button onClick={handleResetData} className="w-full py-2 border border-red-200 text-red-500 rounded font-bold text-sm">重置所有</button>
             </div>
          )}

          {activeTab === 'cloud' && (
             <div className="space-y-4">
                 <div><label className="text-xs font-bold">Access Key</label><input type="password" value={cloudSettings.apiKey} onChange={(e) => setCloudSettings({ ...cloudSettings, apiKey: e.target.value })} className="w-full p-2 border rounded text-sm" /></div>
                 <div><label className="text-xs font-bold">Bin ID</label><input type="text" value={cloudSettings.binId} onChange={(e) => setCloudSettings({ ...cloudSettings, binId: e.target.value })} className="w-full p-2 border rounded text-sm" /></div>
                 <div className="flex items-center justify-between bg-slate-50 p-2 rounded">
                     <span className="text-xs font-bold">自动同步</span>
                     <button onClick={() => setCloudSettings({ ...cloudSettings, autoSyncEnabled: !cloudSettings.autoSyncEnabled })} className={`w-8 h-4 rounded-full relative ${cloudSettings.autoSyncEnabled ? 'bg-purple-600' : 'bg-slate-300'}`}><div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${cloudSettings.autoSyncEnabled ? 'left-4.5' : 'left-0.5'}`}></div></button>
                 </div>
                 {cloudSettings.autoSyncEnabled && (
                     <select value={cloudSettings.autoSyncInterval} onChange={(e) => setCloudSettings({ ...cloudSettings, autoSyncInterval: Number(e.target.value) })} className="w-full p-2 border rounded text-sm">
                         <option value={60}>1小时</option><option value={240}>4小时</option><option value={720}>12小时</option>
                     </select>
                 )}
                 <div className="flex gap-2">
                     <button onClick={handleCloudSync} disabled={isCloudSyncing} className="flex-1 py-2 bg-purple-600 text-white rounded font-bold text-sm">更新</button>
                     <button onClick={handleCloudRestore} disabled={isCloudSyncing} className="flex-1 py-2 border border-purple-200 text-purple-600 rounded font-bold text-sm">恢复</button>
                 </div>
             </div>
          )}
        </div>
        <div className="p-4 landscape:p-2 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} className="w-full py-3 landscape:py-2 bg-slate-900 text-white rounded-xl font-bold">完成</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
