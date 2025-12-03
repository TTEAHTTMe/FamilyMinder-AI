import React, { useState, useEffect } from 'react';
import { User, VoiceSettings, AISettings, AIProvider } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  setUsers: (users: User[]) => void;
  voiceSettings: VoiceSettings;
  setVoiceSettings: (settings: VoiceSettings) => void;
  aiSettings: AISettings;
  setAiSettings: (settings: AISettings) => void;
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
  setAiSettings
}) => {
  const [activeTab, setActiveTab] = useState<'family' | 'voice' | 'ai'>('family');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Local state to track which user ID is pending deletion confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load voices safely
  useEffect(() => {
    const loadVoices = () => {
      if (!('speechSynthesis' in window)) return;
      const voices = window.speechSynthesis.getVoices();
      const zhVoices = voices.filter(v => v.lang.includes('zh') || v.lang.includes('CN'));
      setAvailableVoices(zhVoices.length > 0 ? zhVoices : voices);
    };

    if ('speechSynthesis' in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { 
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = null; 
        }
    };
  }, []);

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
    if (!('speechSynthesis' in window)) {
        alert("您的浏览器不支持语音功能。");
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
      const currentConfigs = aiSettings.configs || {};
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
                   <span className="text-xs text-slate-500">{voiceSettings.pitch.toFixed(1)}</span>
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