import { UserSettings, DEFAULT_SETTINGS } from '../shared/types/index';
import './options.css';

const apiKeyEl = document.getElementById('api-key') as HTMLInputElement;
const targetLangEl = document.getElementById('target-lang') as HTMLSelectElement;
const showChatboxEl = document.getElementById('show-chatbox') as HTMLInputElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const saveStatusEl = document.getElementById('save-status') as HTMLSpanElement;
const deleteKeyBtn = document.getElementById('delete-key') as HTMLButtonElement;

chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
  const s: UserSettings = response?.settings || DEFAULT_SETTINGS;
  if (s.claudeApiKey) {
    apiKeyEl.placeholder = 'API Key 已设置（留空保持不变）';
    deleteKeyBtn.style.display = 'inline-block';
  }
  targetLangEl.value = s.targetLanguage;
  showChatboxEl.checked = s.showChatbox;
});

saveBtn.addEventListener('click', () => {
  const partial: Partial<UserSettings> = {
    targetLanguage: targetLangEl.value as 'zh-CN' | 'zh-TW',
    showChatbox: showChatboxEl.checked,
  };

  const newKey = apiKeyEl.value.trim();
  if (newKey) partial.claudeApiKey = newKey;

  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: partial }, (response) => {
    if (response?.success) {
      saveStatusEl.textContent = '设置已保存';
      saveStatusEl.style.color = '#059669';
      if (newKey) { apiKeyEl.value = ''; apiKeyEl.placeholder = 'API Key 已设置（留空保持不变）'; deleteKeyBtn.style.display = 'inline-block'; }
      setTimeout(() => { saveStatusEl.textContent = ''; }, 3000);
    } else {
      saveStatusEl.textContent = '保存失败';
      saveStatusEl.style.color = '#dc2626';
    }
  });
});

deleteKeyBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { claudeApiKey: '' } }, (response) => {
    if (response?.success) {
      saveStatusEl.textContent = 'API Key 已删除';
      saveStatusEl.style.color = '#f59e0b';
      apiKeyEl.placeholder = '粘贴任意 API Key...';
      deleteKeyBtn.style.display = 'none';
      setTimeout(() => { saveStatusEl.textContent = ''; }, 3000);
    }
  });
});
