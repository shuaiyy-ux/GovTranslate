import { UserSettings, DEFAULT_SETTINGS } from '../shared/types/index';
import { isGovernmentUrl, isPdfUrl } from '../shared/constants/gov-domains';
import { getProviderName } from '../shared/api/claude-client';
import './popup.css';

const translateBtn = document.getElementById('translate-btn') as HTMLButtonElement;
const targetLangEl = document.getElementById('target-lang') as HTMLSelectElement;
const apiKeyEl = document.getElementById('api-key') as HTMLInputElement;
const saveKeyBtn = document.getElementById('save-key') as HTMLButtonElement;
const apiStatusEl = document.getElementById('api-status') as HTMLSpanElement;
const pageStatusEl = document.getElementById('page-status') as HTMLSpanElement;
const apiWarning = document.getElementById('api-warning') as HTMLDivElement;

// Load settings
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
  const settings: UserSettings = response?.settings || DEFAULT_SETTINGS;
  targetLangEl.value = settings.targetLanguage;
  if (settings.claudeApiKey) {
    apiKeyEl.value = '••••••••';
    const provider = getProviderName(settings.claudeApiKey);
    apiStatusEl.textContent = `已连接 ${provider}`;
    apiStatusEl.style.color = '#059669';
  } else {
    apiWarning.style.display = 'block';
  }
});

// Check current page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab?.url) {
    const isGov = isGovernmentUrl(tab.url);
    const isPdf = isPdfUrl(tab.url);
    if (isPdf) {
      pageStatusEl.textContent = 'PDF 文档';
      pageStatusEl.style.color = '#7c3aed';
      translateBtn.textContent = '翻译此 PDF';
    } else if (isGov) {
      pageStatusEl.textContent = '政府网站';
      pageStatusEl.style.color = '#059669';
    } else if (tab.url.includes('translate.google') || tab.url.includes('.translate.goog')) {
      pageStatusEl.textContent = '已翻译页面（高亮选词可用）';
      pageStatusEl.style.color = '#1e40af';
      translateBtn.disabled = true;
      translateBtn.textContent = '已在翻译页面';
    } else {
      pageStatusEl.textContent = '非政府网站';
      pageStatusEl.style.color = '#6b7280';
      translateBtn.disabled = true;
    }
  }
});

// Translate button
translateBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_TRANSLATE' });
      window.close();
    }
  });
});

// Save or delete API key
saveKeyBtn.addEventListener('click', () => {
  const raw = apiKeyEl.value.trim();
  if (raw === '••••••••') return; // No change

  // Empty = delete key, non-empty = save key
  const key = raw || '';

  chrome.runtime.sendMessage(
    { type: 'SAVE_SETTINGS', settings: { claudeApiKey: key } },
    (response) => {
      if (response?.success) {
        if (key) {
          const provider = getProviderName(key);
          apiStatusEl.textContent = `已连接 ${provider}`;
          apiStatusEl.style.color = '#059669';
          apiKeyEl.value = '••••••••';
          apiWarning.style.display = 'none';
        } else {
          apiStatusEl.textContent = 'API Key 已删除';
          apiStatusEl.style.color = '#f59e0b';
          apiKeyEl.value = '';
          apiKeyEl.placeholder = '粘贴任意 API Key...';
          apiWarning.style.display = 'block';
        }
      } else {
        apiStatusEl.textContent = '保存失败';
        apiStatusEl.style.color = '#dc2626';
      }
    },
  );
});

// Tutorial toggle
const tutorialToggle = document.getElementById('tutorial-toggle') as HTMLButtonElement;
const tutorialContent = document.getElementById('tutorial-content') as HTMLDivElement;

tutorialToggle.addEventListener('click', () => {
  const isOpen = tutorialContent.style.display !== 'none';
  tutorialContent.style.display = isOpen ? 'none' : 'block';
  tutorialToggle.textContent = isOpen ? '使用教程 ▼' : '使用教程 ▲';
});

// Language change
targetLangEl.addEventListener('change', () => {
  chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings: { targetLanguage: targetLangEl.value as 'zh-CN' | 'zh-TW' },
  });
});
