
export interface User {
  id: string;
  name: string;
  avatar: string; // URL or emoji
  color: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  time: string; // Format: "HH:mm"
  date: string; // Format: "YYYY-MM-DD"
  isCompleted: boolean;
  type: 'medication' | 'general' | 'activity';
  lastRemindedAt?: number; // Timestamp
  snoozeUntil?: number; // Timestamp
}

export interface ParsedReminder {
  title: string;
  time: string;
  date: string; // Format: "YYYY-MM-DD"
  targetUser?: string; // AI implied user
  type: 'medication' | 'general' | 'activity';
}

export interface VoiceSettings {
  voiceURI: string;
  pitch: number;
  rate: number;
  volume: number;
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
