export interface UserSettings {
  claudeApiKey: string;
  targetLanguage: 'zh-CN' | 'zh-TW';
  showChatbox: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  claudeApiKey: '',
  targetLanguage: 'zh-CN',
  showChatbox: true,
};
