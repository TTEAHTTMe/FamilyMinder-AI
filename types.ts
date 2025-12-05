
export interface User {
  id: string;
  name: string;
  avatar: string; // URL or emoji
  color: string;
}

export interface ReminderTypeDefinition {
  id: string;
  label: string;
  icon: string; // FontAwesome class suffix (e.g. 'capsules')
  color: string; // Tailwind class (e.g. 'bg-red-500')
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  time: string; // Format: "HH:mm"
  date: string; // Format: "YYYY-MM-DD"
  isCompleted: boolean;
  type: string; // Dynamic ID now, was union
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  lastRemindedAt?: number; // Timestamp
  snoozeUntil?: number; // Timestamp
}

export interface ParsedReminder {
  title: string;
  time: string;
  date: string; // Format: "YYYY-MM-DD"
  targetUser?: string; // AI implied user
  type: string;
  recurrence?: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
}

// New Interface for Smart Intent Response
export interface AIResponse {
  action: 'create_reminder' | 'chat_response';
  reminder?: ParsedReminder; // Only present if action is create_reminder
  replyText?: string;       // Only present if action is chat_response
}

export interface VoiceSettings {
  provider?: 'web' | 'openai'; // New: Choose provider
  voiceURI: string; // Used for Web Speech API (Voice name) OR OpenAI (Voice ID like 'alloy')
  pitch: number;
  rate: number;
  volume: number;
  model?: string; // For OpenAI, e.g. 'tts-1'
}

export type AIProvider = 'gemini' | 'deepseek' | 'moonshot' | 'siliconflow' | 'custom';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AISettings {
  activeProvider: AIProvider;
  configs: {
    [key in AIProvider]: AIConfig;
  };
}

export interface CloudSettings {
  apiKey: string; // X-Access-Key
  binId: string; // Bin ID
  autoSyncEnabled: boolean;
  autoSyncInterval: number; // in minutes
  lastAutoSync?: number; // timestamp
}
