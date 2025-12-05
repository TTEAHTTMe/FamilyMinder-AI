
import React, { useState, useEffect } from 'react';
import { User, Reminder } from '../types';
import { getTodayString } from '../constants';

interface ManualInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Reminder, 'id'>) => void;
  users: User[];
  currentUser: User;
  initialData?: Reminder;
}

const ManualInputModal: React.FC<ManualInputModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  users, 
  currentUser,
  initialData 
}) => {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(currentUser.id);
  const [type, setType] = useState<Reminder['type']>('general');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Edit mode
        setTitle(initialData.title);
        setTime(initialData.time);
        setDate(initialData.date || getTodayString());
        setSelectedUserId(initialData.userId);
        setType(initialData.type);
      } else {
        // Create mode
        setTitle('');
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
        // FIX: Use local date string helper instead of UTC
        setTime(timeString);
        setDate(getTodayString());
        
        // If currentUser is generic 'all' (Home View), default to the first real user
        if (currentUser.id === 'all' && users.length > 0) {
            setSelectedUserId(users[0].id);
        } else {
            setSelectedUserId(currentUser.id);
        }
        
        setType('general');
      }
    }
  }, [isOpen, initialData, currentUser, users]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !time || !date) return;

    onSave({
      title,
      time,
      date,
      userId: selectedUserId,
      type,
      isCompleted: initialData ? initialData.isCompleted : false
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in landscape:items-start landscape:pt-4 landscape:overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md landscape:max-w-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800">
              {initialData ? '修改提醒' : '添加提醒'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fa-solid fa-times text-xl"></i>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 landscape:p-4 space-y-6 landscape:space-y-0 landscape:grid landscape:grid-cols-2 landscape:gap-6 overflow-y-auto">
          {/* Left Column in Landscape */}
          <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">提醒内容</label>
                <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：吃降压药"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">日期</label>
                <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
                required
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">时间</label>
                <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
                    required
                />
                </div>
                <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">提醒谁</label>
                <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none appearance-none"
                >
                    {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
                </div>
            </div>
          </div>

          {/* Right Column in Landscape */}
          <div className="space-y-4 flex flex-col justify-between">
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">类型</label>
                <div className="grid grid-cols-3 landscape:grid-cols-1 gap-3">
                    <button
                    type="button"
                    onClick={() => setType('medication')}
                    className={`flex flex-col landscape:flex-row items-center justify-center landscape:justify-start gap-2 p-3 rounded-xl border-2 transition-all ${type === 'medication' ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                    >
                    <i className="fa-solid fa-capsules text-xl"></i>
                    <span className="text-xs font-bold">用药</span>
                    </button>
                    <button
                    type="button"
                    onClick={() => setType('activity')}
                    className={`flex flex-col landscape:flex-row items-center justify-center landscape:justify-start gap-2 p-3 rounded-xl border-2 transition-all ${type === 'activity' ? 'border-yellow-500 bg-yellow-50 text-yellow-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                    >
                    <i className="fa-solid fa-person-running text-xl"></i>
                    <span className="text-xs font-bold">活动</span>
                    </button>
                    <button
                    type="button"
                    onClick={() => setType('general')}
                    className={`flex flex-col landscape:flex-row items-center justify-center landscape:justify-start gap-2 p-3 rounded-xl border-2 transition-all ${type === 'general' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                    >
                    <i className="fa-regular fa-note-sticky text-xl"></i>
                    <span className="text-xs font-bold">常规</span>
                    </button>
                </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-4 pt-4 landscape:pt-0">
                <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 text-slate-600 font-medium bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                取消
                </button>
                <button
                type="submit"
                className="flex-1 py-3 text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                {initialData ? '保存' : '保存'}
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualInputModal;
