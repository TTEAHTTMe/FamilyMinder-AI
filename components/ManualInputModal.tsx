
import React, { useState, useEffect } from 'react';
import { User, Reminder, ReminderTypeDefinition } from '../types';
import { getTodayString } from '../constants';

interface ManualInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Reminder, 'id'>) => void;
  users: User[];
  currentUser: User;
  initialData?: Reminder;
  reminderTypes: ReminderTypeDefinition[];
  onManageTypes: () => void;
}

const ManualInputModal: React.FC<ManualInputModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  users, 
  currentUser,
  initialData,
  reminderTypes,
  onManageTypes
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(currentUser.id);
  const [type, setType] = useState<string>('general');
  const [recurrence, setRecurrence] = useState<Reminder['recurrence']>('once');
  
  // Time selectors
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Edit mode
        setTitle(initialData.title);
        const [h, m] = initialData.time.split(':');
        setHour(h || '08');
        setMinute(m || '00');
        setDate(initialData.date || getTodayString());
        setSelectedUserId(initialData.userId);
        setType(initialData.type);
        setRecurrence(initialData.recurrence || 'once');
      } else {
        // Create mode
        setTitle('');
        const now = new Date();
        setHour(String(now.getHours()).padStart(2, '0'));
        setMinute(String(now.getMinutes()).padStart(2, '0'));
        setDate(getTodayString());
        if (currentUser.id === 'all' && users.length > 0) {
            setSelectedUserId(users[0].id);
        } else {
            setSelectedUserId(currentUser.id);
        }
        setType(reminderTypes[0]?.id || 'general');
        setRecurrence('once');
      }
    }
  }, [isOpen, initialData, currentUser, users, reminderTypes]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    
    const time = `${hour}:${minute}`;

    onSave({
      title,
      time,
      date,
      userId: selectedUserId,
      type,
      recurrence,
      isCompleted: initialData ? initialData.isCompleted : false
    });
    onClose();
  };

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 landscape:p-2 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md landscape:max-w-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[95vh]">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-base font-bold text-slate-800">
              {initialData ? '修改提醒' : '添加提醒'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fa-solid fa-times text-lg"></i>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 landscape:p-3 overflow-y-auto">
          <div className="grid grid-cols-1 landscape:grid-cols-2 gap-4 landscape:gap-3">
            {/* Left Column */}
            <div className="space-y-3 landscape:space-y-2">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">内容</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="例如：吃药"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">提醒谁</label>
                    <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm"
                    >
                        {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">日期</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">时间</label>
                        <div className="flex gap-1">
                            <select 
                                value={hour} 
                                onChange={(e) => setHour(e.target.value)}
                                className="flex-1 px-1 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm text-center"
                            >
                                {hours.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span className="self-center font-bold text-slate-400">:</span>
                            <select 
                                value={minute} 
                                onChange={(e) => setMinute(e.target.value)}
                                className="flex-1 px-1 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm text-center"
                            >
                                {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3 landscape:space-y-2 flex flex-col justify-between">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">重复频率</label>
                    <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm"
                    >
                        <option value="once">一次性</option>
                        <option value="daily">每天</option>
                        <option value="weekly">每周</option>
                        <option value="monthly">每月</option>
                        <option value="yearly">每年</option>
                    </select>
                </div>

                <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-medium text-slate-500">类型</label>
                        <button type="button" onClick={onManageTypes} className="text-xs text-blue-600 hover:text-blue-800"><i className="fa-solid fa-gear"></i> 管理</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {reminderTypes.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setType(t.id)}
                                className={`py-1.5 px-3 rounded-full border text-xs font-bold flex items-center gap-1 transition-all ${
                                    type === t.id 
                                    ? t.color + ' text-white border-transparent'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                <i className={`fa-solid fa-${t.icon}`}></i>
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-2">
                    <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2 text-slate-600 font-medium bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                    >
                    取消
                    </button>
                    <button
                    type="submit"
                    className="flex-1 py-2 text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition-all active:scale-95 text-sm"
                    >
                    保存
                    </button>
                </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualInputModal;
