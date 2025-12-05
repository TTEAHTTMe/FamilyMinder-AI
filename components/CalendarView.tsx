
import React, { useState } from 'react';
import { Reminder, User } from '../types';

interface CalendarViewProps {
  currentDate: Date;
  reminders: Reminder[];
  users: User[];
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ currentDate, reminders, users, onSelectDate, onClose }) => {
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  
  // Generate calendar grid
  const days = [];
  // Empty slots for previous month
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  // Actual days
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleDateClick = (day: number) => {
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${viewYear}-${monthStr}-${dayStr}`;
    onSelectDate(dateStr);
  };

  const getRemindersForDay = (day: number) => {
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${viewYear}-${monthStr}-${dayStr}`;
    return reminders.filter(r => r.date === dateStr && !r.isCompleted);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white animate-fade-in">
        <div className="flex justify-between items-center p-6 landscape:p-2 border-b border-slate-100">
            <h2 className="text-2xl landscape:text-lg font-bold text-slate-800">
                {viewYear}年 {viewMonth + 1}月
            </h2>
            <div className="flex gap-2">
                <button onClick={prevMonth} className="w-10 h-10 landscape:w-8 landscape:h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <i className="fa-solid fa-chevron-left text-slate-600 landscape:text-xs"></i>
                </button>
                <button onClick={nextMonth} className="w-10 h-10 landscape:w-8 landscape:h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <i className="fa-solid fa-chevron-right text-slate-600 landscape:text-xs"></i>
                </button>
                <button onClick={onClose} className="w-10 h-10 landscape:w-8 landscape:h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center ml-4">
                    <i className="fa-solid fa-times text-slate-600 landscape:text-xs"></i>
                </button>
            </div>
        </div>

        <div className="flex-1 p-4 landscape:p-2 overflow-y-auto">
            {/* Week Headers */}
            <div className="grid grid-cols-7 mb-2">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                    <div key={d} className="text-center text-slate-400 font-bold py-2 landscape:py-0 landscape:text-xs">{d}</div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-2 landscape:gap-1">
                {days.map((day, index) => {
                    if (day === null) {
                        return <div key={`empty-${index}`} className="aspect-square landscape:aspect-auto landscape:h-12"></div>;
                    }

                    const dayReminders = getRemindersForDay(day);
                    // Get unique users involved in this day's reminders
                    const involvedUserIds = Array.from(new Set(dayReminders.map(r => r.userId)));

                    const isToday = 
                        day === new Date().getDate() && 
                        viewMonth === new Date().getMonth() && 
                        viewYear === new Date().getFullYear();

                    return (
                        <button 
                            key={day}
                            onClick={() => handleDateClick(day)}
                            className={`
                                aspect-square landscape:aspect-auto landscape:h-full landscape:min-h-[40px] rounded-2xl landscape:rounded-lg flex flex-col items-center justify-start pt-2 landscape:pt-1 relative border-2 transition-all
                                ${isToday ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 bg-white hover:border-blue-200 text-slate-700'}
                            `}
                        >
                            <span className={`text-sm landscape:text-xs font-bold ${isToday ? 'text-blue-600' : ''}`}>{day}</span>
                            
                            {/* Dots for tasks */}
                            <div className="flex gap-1 flex-wrap justify-center mt-1 px-1">
                                {involvedUserIds.map(uid => {
                                    const u = users.find(user => user.id === uid);
                                    if (!u) return null;
                                    return (
                                        <div key={uid} className={`w-2 h-2 landscape:w-1.5 landscape:h-1.5 rounded-full ${u.color}`}></div>
                                    );
                                })}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    </div>
  );
};

export default CalendarView;
