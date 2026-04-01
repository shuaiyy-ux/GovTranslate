import { UserSettings, DEFAULT_SETTINGS } from '../types/index';

const SETTINGS_KEY = 'govTranslateSettings';
const API_KEY_STORE = 'govTranslateApiKey';

export async function loadSettings(): Promise<UserSettings> {
  const [syncData, localData] = await Promise.all([
    chrome.storage.sync.get(SETTINGS_KEY),
    chrome.storage.local.get(API_KEY_STORE),
  ]);

  const saved = (syncData[SETTINGS_KEY] as Partial<UserSettings>) || {};
  const apiKey = (localData[API_KEY_STORE] as string) || '';

  return { ...DEFAULT_SETTINGS, ...saved, claudeApiKey: apiKey };
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<void> {
  const { claudeApiKey, ...syncable } = partial;
  const promises: Promise<void>[] = [];

  if (Object.keys(syncable).length > 0) {
    const current = await chrome.storage.sync.get(SETTINGS_KEY);
    const existing = (current[SETTINGS_KEY] as Record<string, unknown>) || {};
    promises.push(chrome.storage.sync.set({ [SETTINGS_KEY]: { ...existing, ...syncable } }));
  }

  if (claudeApiKey !== undefined) {
    promises.push(chrome.storage.local.set({ [API_KEY_STORE]: claudeApiKey }));
  }

  await Promise.all(promises);
}

export async function getApiKey(): Promise<string> {
  const data = await chrome.storage.local.get(API_KEY_STORE);
  return (data[API_KEY_STORE] as string) || '';
}
