import { loadSettings, saveSettings, getApiKey } from '../shared/state/store';
import { streamExplanation, streamFollowUp } from '../shared/api/claude-client';

// Handle one-shot messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    loadSettings()
      .then((settings) => sendResponse({ type: 'SETTINGS_RESULT', settings }))
      .catch(() => sendResponse({ type: 'SETTINGS_RESULT', settings: null }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    saveSettings(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    if (_sender.tab?.id) {
      (chrome.sidePanel as any).open({ tabId: _sender.tab.id }).catch(() => {});
    }
    return false;
  }

  return false;
});

// Handle streaming explanation via long-lived port
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'explain') return;

  let disconnected = false;
  port.onDisconnect.addListener(() => { disconnected = true; });

  function safeSend(msg: Record<string, unknown>): void {
    if (!disconnected) {
      try { port.postMessage(msg); } catch { disconnected = true; }
    }
  }

  port.onMessage.addListener(async (message) => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        safeSend({ type: 'EXPLAIN_ERROR', error: '请先设置 API Key（点击扩展图标 → 输入 Key → 保存）' });
        return;
      }
      if (apiKey.length < 10) {
        safeSend({ type: 'EXPLAIN_ERROR', error: 'API Key 格式错误' });
        return;
      }

      const settings = await loadSettings();

      if (message.type === 'EXPLAIN') {
        await streamExplanation(
          apiKey, message.selectedText, message.context,
          message.pageUrl, message.pageTitle, settings.targetLanguage,
          (chunk) => safeSend({ type: 'EXPLAIN_CHUNK', chunk }),
          () => safeSend({ type: 'EXPLAIN_DONE' }),
          (error) => safeSend({ type: 'EXPLAIN_ERROR', error }),
        );
      } else if (message.type === 'FOLLOW_UP') {
        await streamFollowUp(
          apiKey, message.conversationHistory, message.question,
          settings.targetLanguage,
          (chunk) => safeSend({ type: 'EXPLAIN_CHUNK', chunk }),
          () => safeSend({ type: 'EXPLAIN_DONE' }),
          (error) => safeSend({ type: 'EXPLAIN_ERROR', error }),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GovTranslate] Explain error:', msg);
      safeSend({ type: 'EXPLAIN_ERROR', error: msg });
    }
  });
});
