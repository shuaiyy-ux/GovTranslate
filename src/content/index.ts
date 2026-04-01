import { isGovernmentUrl, isGoogleTranslatePage, isPdfUrl } from '../shared/constants/gov-domains';
import { UserSettings, DEFAULT_SETTINGS } from '../shared/types/index';

let settings: UserSettings = DEFAULT_SETTINGS;
let chatboxHost: HTMLDivElement | null = null;
let chatboxShadow: ShadowRoot | null = null;
let messagesEl: HTMLDivElement | null = null;
let inputEl: HTMLInputElement | null = null;
let currentResponseEl: HTMLDivElement | null = null;
let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let justClosed = false;
let triggerBubble: HTMLDivElement | null = null;

async function init(): Promise<void> {
  settings = await getSettings();

  const url = location.href;
  const isGov = isGovernmentUrl(url);
  const isGT = isGoogleTranslatePage();

  // Only activate on .gov sites or Google Translate proxied pages
  if (!isGov && !isGT) return;

  // On Google Translate pages: hide the Google Translate toolbar
  if (isGT) {
    hideGoogleTranslateBar();
  }

  // Enable highlight-to-explain (always listen, show prompt if no API key)
  if (settings.showChatbox) {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeydown);
  }

  // On .gov sites: check for PDF, show translate option
  if (isGov) {
    if (isPdfUrl(url)) {
      showPdfBar();
    } else {
      showTranslateBar();
    }
  }
}

// === Google Translate redirect ===

function hideGoogleTranslateBar(): void {
  const style = document.createElement('style');
  // Target the Google Translate toolbar on translate.goog proxy pages
  // The bar is typically the first child of body with fixed/absolute positioning
  style.textContent = `
    body > .skiptranslate,
    #goog-gt-tt,
    .goog-te-banner-frame,
    .VIpgJd-ZVi9od-ORHb-OEVmcd,
    #gt-nvframe,
    body > div[id^="goog-"],
    body > div.frame { display: none !important; height: 0 !important; }
    body { top: 0 !important; margin-top: 0 !important; }
  `;
  document.head.appendChild(style);

  // The translate.goog bar is dynamically injected — retry hiding after load
  const hideBar = () => {
    // The Google Translate bar is usually the very first child of body with a specific structure
    const firstChild = document.body.firstElementChild;
    if (firstChild && firstChild.tagName === 'DIV') {
      const hasGoogleBranding = firstChild.innerHTML?.includes('translate.google') ||
        firstChild.innerHTML?.includes('Google') && firstChild.querySelector('select, .goog');
      if (hasGoogleBranding) {
        (firstChild as HTMLElement).style.display = 'none';
        document.body.style.top = '0px';
      }
    }
    // Also hide any iframes from Google Translate
    document.querySelectorAll('iframe[src*="translate"]').forEach((f) => {
      (f as HTMLElement).style.display = 'none';
    });
  };

  hideBar();
  setTimeout(hideBar, 1000);
  setTimeout(hideBar, 3000);
}

function showTranslateBar(): void {
  // Don't show if already on a translated page
  if (isGoogleTranslatePage()) return;

  const bar = document.createElement('div');
  bar.id = 'gov-translate-notification';
  bar.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:2147483645;
    background:#1e40af;color:white;padding:10px 20px;
    display:flex;justify-content:space-between;align-items:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15);
  `;

  const label = document.createElement('span');
  label.textContent = '检测到美国政府网站，是否使用智能翻译？';

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display:flex;gap:8px;';

  const yesBtn = document.createElement('button');
  yesBtn.textContent = '翻译';
  yesBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:6px;cursor:pointer;background:white;color:#1e40af;font-weight:600;font-size:13px;';

  const noBtn = document.createElement('button');
  noBtn.textContent = '关闭';
  noBtn.style.cssText = 'padding:6px 16px;border:1px solid rgba(255,255,255,0.4);border-radius:6px;cursor:pointer;background:transparent;color:white;font-size:13px;';

  btnContainer.appendChild(yesBtn);
  btnContainer.appendChild(noBtn);
  bar.appendChild(label);
  bar.appendChild(btnContainer);
  document.body.appendChild(bar);

  yesBtn.addEventListener('click', () => {
    bar.remove();
    openGoogleTranslate();
  });

  noBtn.addEventListener('click', () => bar.remove());
}

async function openGoogleTranslate(): Promise<void> {
  // Re-fetch settings in case language was changed in popup after page load
  settings = await getSettings();
  const lang = settings.targetLanguage === 'zh-TW' ? 'zh-TW' : 'zh-CN';
  const url = `https://translate.google.com/translate?sl=en&tl=${lang}&u=${encodeURIComponent(location.href)}`;
  location.href = url;
}

// === PDF detection and translation ===

function showPdfBar(): void {
  const bar = document.createElement('div');
  bar.id = 'gov-translate-notification';
  bar.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:2147483645;
    background:#7c3aed;color:white;padding:10px 20px;
    display:flex;justify-content:space-between;align-items:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15);
  `;

  const label = document.createElement('span');
  label.textContent = '检测到政府 PDF 文档，是否翻译？';

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display:flex;gap:8px;';

  const translateBtn = document.createElement('button');
  translateBtn.textContent = '翻译 PDF';
  translateBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:6px;cursor:pointer;background:white;color:#7c3aed;font-weight:600;font-size:13px;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = 'padding:6px 16px;border:1px solid rgba(255,255,255,0.4);border-radius:6px;cursor:pointer;background:transparent;color:white;font-size:13px;';

  btnContainer.appendChild(translateBtn);
  btnContainer.appendChild(closeBtn);
  bar.appendChild(label);
  bar.appendChild(btnContainer);
  document.body.appendChild(bar);

  closeBtn.addEventListener('click', () => bar.remove());

  translateBtn.addEventListener('click', async () => {
    // Re-fetch settings for fresh language
    settings = await getSettings();
    const lang = settings.targetLanguage === 'zh-TW' ? 'zh-TW' : 'zh-CN';

    // 1. Download the PDF
    const a = document.createElement('a');
    a.href = location.href;
    a.download = '';
    a.click();

    // 2. Open Google Translate document page
    window.open(`https://translate.google.com/?sl=en&tl=${lang}&op=docs`, '_blank');

    // 3. Update banner
    label.textContent = '已下载 PDF 并打开翻译页面 — 请将下载的文件拖入翻译页面';
    bar.style.background = '#059669';
    translateBtn.style.display = 'none';
  });
}

// === Highlight-to-explain (works on .gov AND Google Translate pages) ===

function handleMouseDown(e: MouseEvent): void {
  const target = e.target as Element;
  if (!target.closest('#gov-translate-chatbox-host') && !target.closest('#gov-translate-trigger')) {
    hideChatbox();
    removeTriggerBubble();
  }
}

function handleMouseUp(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processSelection, 400);
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') hideChatbox();
}

function processSelection(): void {
  if (justClosed) return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    removeTriggerBubble();
    return;
  }

  const text = selection.toString().trim();
  if (text.length < 3) {
    removeTriggerBubble();
    return;
  }

  // Don't trigger inside our own chatbox or trigger bubble
  const anchor = selection.anchorNode;
  if (anchor) {
    const parentEl = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement;
    if (parentEl?.closest('#gov-translate-chatbox-host, #gov-translate-trigger')) return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Get context
  let container = range.commonAncestorContainer;
  if (container.nodeType === Node.TEXT_NODE) container = container.parentElement!;
  const blockParent = (container as Element).closest('p, li, td, div, section, article, blockquote') || container;
  let context = blockParent.textContent || '';
  if (context.length > 2000) context = context.slice(0, 2000) + '...';

  // Show a small "AI 解释" trigger bubble near the selection
  showTriggerBubble(rect, text, context);
}

function showTriggerBubble(rect: DOMRect, selectedText: string, context: string): void {
  removeTriggerBubble();

  triggerBubble = document.createElement('div');
  triggerBubble.id = 'gov-translate-trigger';
  triggerBubble.textContent = '💡 AI 解释';
  triggerBubble.style.cssText = `
    position:fixed;z-index:2147483647;
    padding:4px 12px;border-radius:16px;
    background:#1e40af;color:white;font-size:13px;font-weight:500;
    cursor:pointer;user-select:none;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    box-shadow:0 2px 8px rgba(0,0,0,0.2);
    transition:transform 0.1s;
  `;

  // Position above the selection
  let left = rect.left + rect.width / 2 - 45;
  let top = rect.top - 32;
  if (top < 5) top = rect.bottom + 5;
  if (left < 5) left = 5;
  if (left + 90 > window.innerWidth) left = window.innerWidth - 95;

  triggerBubble.style.left = `${left}px`;
  triggerBubble.style.top = `${top}px`;

  triggerBubble.addEventListener('mouseenter', () => {
    if (triggerBubble) triggerBubble.style.transform = 'scale(1.05)';
  });
  triggerBubble.addEventListener('mouseleave', () => {
    if (triggerBubble) triggerBubble.style.transform = 'scale(1)';
  });

  triggerBubble.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTriggerBubble();
    showChatbox(selectedText, context, rect);
  });

  document.body.appendChild(triggerBubble);
}

function removeTriggerBubble(): void {
  triggerBubble?.remove();
  triggerBubble = null;
}

// === Chatbox UI (Shadow DOM) ===

async function showChatbox(selectedText: string, context: string, rect: DOMRect): Promise<void> {
  conversationHistory = [];

  if (!chatboxHost) createChatbox();
  clearMessages();
  positionChatbox(rect);
  chatboxHost!.style.display = 'block';

  // Reload settings fresh (user may have saved API key after page load)
  settings = await getSettings();

  if (!settings.claudeApiKey) {
    addAiMsg('请先设置 API Key（点击扩展图标 → 输入 Key → 保存）', false, true);
    enableInput();
    return;
  }

  addUserMsg(`"${selectedText}"`);
  addAiMsg('正在思考...', true);

  // Build full prompt for conversation history
  const fullPrompt = `[${document.title}] [${location.href}]\n选中: "${selectedText}"\n上下文: ${context}`;

  const port = chrome.runtime.connect({ name: 'explain' });
  let fullResponse = '';
  let done = false;

  // Timeout: if no response in 15 seconds, show error
  const timeout = setTimeout(() => {
    if (!done) {
      done = true;
      clearLastMsg();
      addAiMsg('连接超时，请检查网络和 API Key 设置', false, true);
      enableInput();
      try { port.disconnect(); } catch {}
    }
  }, 15000);

  port.onDisconnect.addListener(() => {
    if (!done) {
      done = true;
      clearTimeout(timeout);
      clearLastMsg();
      addAiMsg('连接中断，请重试', false, true);
      enableInput();
    }
  });

  port.onMessage.addListener((msg) => {
    if (msg.type === 'EXPLAIN_CHUNK') {
      clearTimeout(timeout); // Got data, cancel timeout
      if (!fullResponse) clearLastMsg();
      fullResponse += msg.chunk;
      updateLastAiMsg(fullResponse);
    } else if (msg.type === 'EXPLAIN_DONE') {
      done = true;
      clearTimeout(timeout);
      // Check for empty response
      if (!fullResponse.trim()) {
        clearLastMsg();
        addAiMsg('AI 未返回内容，请检查 API Key 是否有效', false, true);
      } else {
        finalizeLastMsg(fullResponse);
        conversationHistory.push(
          { role: 'user', content: fullPrompt },
          { role: 'assistant', content: fullResponse },
        );
      }
      enableInput();
      port.disconnect();
    } else if (msg.type === 'EXPLAIN_ERROR') {
      done = true;
      clearTimeout(timeout);
      clearLastMsg();
      addAiMsg(msg.error, false, true);
      enableInput();
      port.disconnect();
    }
  });

  port.postMessage({
    type: 'EXPLAIN',
    selectedText,
    context,
    pageUrl: location.href,
    pageTitle: document.title,
  });
}

function hideChatbox(): void {
  if (chatboxHost) chatboxHost.style.display = 'none';
  currentResponseEl = null;
  justClosed = true;
  setTimeout(() => { justClosed = false; }, 500);
}

function createChatbox(): void {
  chatboxHost = document.createElement('div');
  chatboxHost.id = 'gov-translate-chatbox-host';
  chatboxHost.style.cssText = 'position:fixed;z-index:2147483647;display:none;';

  chatboxShadow = chatboxHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CHATBOX_CSS;
  chatboxShadow.appendChild(style);

  const box = document.createElement('div');
  box.className = 'chatbox';

  // Header
  const header = document.createElement('div');
  header.className = 'header';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = 'GovTranslate AI';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', hideChatbox);
  header.appendChild(title);
  header.appendChild(closeBtn);
  makeDraggable(header, chatboxHost);

  // Messages
  messagesEl = document.createElement('div');
  messagesEl.className = 'messages';

  // Input
  const inputArea = document.createElement('div');
  inputArea.className = 'input-area';
  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'input';
  inputEl.placeholder = '等待回复...';
  inputEl.disabled = true;
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && inputEl!.value.trim()) {
      const q = inputEl!.value.trim();
      inputEl!.value = '';
      inputEl!.disabled = true;
      handleFollowUp(q);
    }
  });
  inputArea.appendChild(inputEl);

  box.appendChild(header);
  box.appendChild(messagesEl);
  box.appendChild(inputArea);
  chatboxShadow.appendChild(box);
  document.body.appendChild(chatboxHost);
}

function handleFollowUp(question: string): void {
  addUserMsg(question);
  addAiMsg('正在思考...', true);

  const port = chrome.runtime.connect({ name: 'explain' });
  let fullResponse = '';
  let done = false;

  const timeout = setTimeout(() => {
    if (!done) {
      done = true;
      clearLastMsg();
      addAiMsg('连接超时，请检查网络', false, true);
      enableInput();
      try { port.disconnect(); } catch {}
    }
  }, 15000);

  port.onDisconnect.addListener(() => {
    if (!done) {
      done = true;
      clearTimeout(timeout);
      clearLastMsg();
      addAiMsg('连接中断，请重试', false, true);
      enableInput();
    }
  });

  port.onMessage.addListener((msg) => {
    if (msg.type === 'EXPLAIN_CHUNK') {
      clearTimeout(timeout);
      if (!fullResponse) clearLastMsg();
      fullResponse += msg.chunk;
      updateLastAiMsg(fullResponse);
    } else if (msg.type === 'EXPLAIN_DONE') {
      done = true;
      clearTimeout(timeout);
      if (!fullResponse.trim()) {
        clearLastMsg();
        addAiMsg('AI 未返回内容，请检查 API Key', false, true);
      } else {
        finalizeLastMsg(fullResponse);
        conversationHistory.push(
          { role: 'user', content: question },
          { role: 'assistant', content: fullResponse },
        );
      }
      enableInput();
      port.disconnect();
    } else if (msg.type === 'EXPLAIN_ERROR') {
      done = true;
      clearTimeout(timeout);
      clearLastMsg();
      addAiMsg(msg.error, false, true);
      enableInput();
      port.disconnect();
    }
  });

  port.postMessage({ type: 'FOLLOW_UP', question, conversationHistory });
}

// === Chatbox DOM helpers ===

function addUserMsg(text: string): void {
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = 'msg user';
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addAiMsg(text: string, isLoading = false, isError = false): void {
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = `msg ai${isLoading ? ' loading' : ''}${isError ? ' error' : ''}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  currentResponseEl = el;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateLastAiMsg(text: string): void {
  if (!currentResponseEl) {
    addAiMsg('', false);
  }
  currentResponseEl!.textContent = text;
  messagesEl!.scrollTop = messagesEl!.scrollHeight;
}

function finalizeLastMsg(text: string): void {
  if (currentResponseEl) {
    currentResponseEl.innerHTML = escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    currentResponseEl.classList.remove('loading');
  }
  currentResponseEl = null;
}

function clearLastMsg(): void {
  if (currentResponseEl) {
    currentResponseEl.remove();
    currentResponseEl = null;
  }
}

function clearMessages(): void {
  if (messagesEl) messagesEl.innerHTML = '';
  currentResponseEl = null;
}

function enableInput(): void {
  if (inputEl) {
    inputEl.disabled = false;
    inputEl.placeholder = '继续提问...';
    inputEl.focus();
  }
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function positionChatbox(rect: DOMRect): void {
  if (!chatboxHost) return;
  const W = 400, H = 380, M = 10;
  let left = rect.left + rect.width / 2 - W / 2;
  let top = rect.bottom + M;
  if (left < M) left = M;
  if (left + W > window.innerWidth - M) left = window.innerWidth - W - M;
  if (top + H > window.innerHeight - M) top = rect.top - H - M;
  if (top < M) top = M;
  chatboxHost.style.left = `${left}px`;
  chatboxHost.style.top = `${top}px`;
}

function makeDraggable(handle: HTMLElement, host: HTMLElement): void {
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    host.style.left = `${sl + e.clientX - sx}px`;
    host.style.top = `${st + e.clientY - sy}px`;
  };
  const onUp = () => { dragging = false; };
  handle.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('.btn-close')) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    sl = parseInt(host.style.left) || 0; st = parseInt(host.style.top) || 0;
    e.preventDefault();
  });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// === Utility ===

async function getSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (chrome.runtime.lastError || !response) { resolve(DEFAULT_SETTINGS); return; }
      resolve(response.settings || DEFAULT_SETTINGS);
    });
  });
}

// Listen for popup trigger
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRIGGER_TRANSLATE') {
    openGoogleTranslate();
    sendResponse({ ok: true });
  }
  return false;
});

// === Chatbox CSS ===

const CHATBOX_CSS = `
  .chatbox {
    width: 400px; max-height: 450px; background: #fff; border: 1px solid #d1d5db;
    border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.15);
    display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px; color: #1f2937; overflow: hidden;
  }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; background: #1e40af; color: white; cursor: move; user-select: none;
  }
  .title { font-weight: 600; font-size: 13px; }
  .btn-close {
    background: none; border: none; color: white; cursor: pointer;
    font-size: 14px; padding: 2px 6px; border-radius: 4px; opacity: 0.8;
  }
  .btn-close:hover { opacity: 1; background: rgba(255,255,255,0.2); }
  .messages {
    flex: 1; overflow-y: auto; padding: 12px 14px; min-height: 100px; max-height: 300px;
  }
  .msg { margin-bottom: 10px; padding: 8px 12px; border-radius: 8px; line-height: 1.5; word-wrap: break-word; }
  .msg.user { background: #eff6ff; color: #1e40af; font-style: italic; font-size: 13px; }
  .msg.ai { background: #f9fafb; border: 1px solid #e5e7eb; }
  .msg.ai.loading { color: #9ca3af; }
  .msg.ai.error { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
  .input-area { padding: 10px 14px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
  .input {
    width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px;
    font-size: 13px; outline: none; box-sizing: border-box; font-family: inherit;
  }
  .input:focus { border-color: #1e40af; box-shadow: 0 0 0 2px rgba(30,64,175,0.15); }
  .input:disabled { background: #f3f4f6; cursor: not-allowed; }
  .messages::-webkit-scrollbar { width: 6px; }
  .messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
  strong { font-weight: 600; }
`;

// Init
init().catch((err) => console.error('[GovTranslate] Init error:', err));
