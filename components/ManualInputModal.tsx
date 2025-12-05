
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
  const [recurrence, setRecurrence] = useState<Reminder['recurrence']>('once');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Edit mode
        setTitle(initialData.title);
        setTime(initialData.time);
        setDate(initialData.date || getTodayString());
        setSelectedUserId(initialData.userId);
        setType(initialData.type);
        setRecurrence(initialData.recurrence || 'once');
      } else {
        // Create mode
        setTitle('');
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        setTime(timeString);
        setDate(getTodayString());
        if (currentUser.id === 'all' && users.length > 0) {
            setSelectedUserId(users[0].id);
        } else {
            setSelectedUserId(currentUser.id);
        }
        setType('general');
        setRecurrence('once');
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
      recurrence,
      isCompleted: initialData ? initialData.isCompleted : false
    });
    onClose();
  };

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
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none text-sm"
                            required
                        />
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

                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">类型</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                        type="button"
                        onClick={() => setType('medication')}
                        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all ${type === 'medication' ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-100 bg-white text-slate-400'}`}
                        >
                        <i className="fa-solid fa-capsules text-sm"></i>
                        <span className="text-[10px] font-bold">用药</span>
                        </button>
                        <button
                        type="button"
                        onClick={() => setType('activity')}
                        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all ${type === 'activity' ? 'border-yellow-500 bg-yellow-50 text-yellow-600' : 'border-slate-100 bg-white text-slate-400'}`}
                        >
                        <i className="fa-solid fa-person-running text-sm"></i>
                        <span className="text-[10px] font-bold">活动</span>
                        </button>
                        <button
                        type="button"
                        onClick={() => setType('general')}
                        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border transition-all ${type === 'general' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 bg-white text-slate-400'}`}
                        >
                        <i className="fa-regular fa-note-sticky text-sm"></i>
                        <span className="text-[10px] font-bold">常规</span>
                        </button>
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
