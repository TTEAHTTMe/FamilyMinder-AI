
import { User, ReminderTypeDefinition } from './types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: '爷爷', avatar: '👴', color: 'bg-blue-500' },
  { id: 'u2', name: '奶奶', avatar: '👵', color: 'bg-emerald-500' },
  { id: 'u3', name: '爸爸', avatar: '👨', color: 'bg-indigo-500' },
  { id: 'u4', name: '妈妈', avatar: '👩', color: 'bg-rose-500' },
  { id: 'u5', name: '宝贝', avatar: '👶', color: 'bg-yellow-500' },
];

export const DEFAULT_REMINDER_TYPES: ReminderTypeDefinition[] = [
    { id: 'medication', label: '用药', icon: 'capsules', color: 'bg-red-500' },
    { id: 'activity', label: '活动', icon: 'person-running', color: 'bg-yellow-500' },
    { id: 'general', label: '常规', icon: 'note-sticky', color: 'bg-blue-500' },
];

export const getTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const INITIAL_REMINDERS: any[] = [
  { id: 'r1', userId: 'u1', title: '服用降压药', time: '08:00', date: getTodayString(), isCompleted: false, type: 'medication' },
  { id: 'r2', userId: 'u2', title: '测量血糖', time: '09:00', date: getTodayString(), isCompleted: true, type: 'medication' },
];

// Simple digital alarm beep sound (Base64 MP3) to ensure audio plays even if TTS fails or is quiet
export const ALARM_SOUND_DATA_URI = 'data:audio/mp3;base64,//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//uQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
