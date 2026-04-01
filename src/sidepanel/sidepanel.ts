import './sidepanel.css';

const messagesEl = document.getElementById('messages') as HTMLDivElement;
const inputEl = document.getElementById('input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
let currentResponseEl: HTMLDivElement | null = null;

function handleSend(): void {
  const question = inputEl.value.trim();
  if (!question) return;
  inputEl.value = '';
  inputEl.disabled = true;
  sendBtn.disabled = true;

  addUserMessage(question);
  showLoading();

  const port = chrome.runtime.connect({ name: 'explain' });
  let fullResponse = '';

  port.onMessage.addListener((msg) => {
    if (msg.type === 'EXPLAIN_CHUNK') {
      if (!fullResponse) { clearLoading(); currentResponseEl = addAiMessage(''); }
      fullResponse += msg.chunk;
      if (currentResponseEl) currentResponseEl.textContent = fullResponse;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (msg.type === 'EXPLAIN_DONE') {
      if (currentResponseEl) currentResponseEl.innerHTML = renderMarkdown(fullResponse);
      conversationHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: fullResponse },
      );
      currentResponseEl = null;
      enableInput();
      port.disconnect();
    } else if (msg.type === 'EXPLAIN_ERROR') {
      clearLoading();
      addErrorMessage(msg.error);
      enableInput();
      port.disconnect();
    }
  });

  port.postMessage({ type: 'FOLLOW_UP', question, conversationHistory });
}

inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });
sendBtn.addEventListener('click', handleSend);

function addUserMessage(text: string): void {
  const el = document.createElement('div');
  el.className = 'msg user-msg';
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addAiMessage(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'msg ai-msg';
  el.textContent = text;
  messagesEl.appendChild(el);
  return el;
}

function addErrorMessage(text: string): void {
  const el = document.createElement('div');
  el.className = 'msg error-msg';
  el.textContent = text;
  messagesEl.appendChild(el);
}

function showLoading(): void {
  const el = document.createElement('div');
  el.className = 'msg ai-msg loading';
  el.id = 'loading-msg';
  el.textContent = '正在思考...';
  messagesEl.appendChild(el);
}

function clearLoading(): void { document.getElementById('loading-msg')?.remove(); }
function enableInput(): void {
  inputEl.disabled = false; sendBtn.disabled = false;
  inputEl.placeholder = '继续提问...'; inputEl.focus();
}

function escapeHTML(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text: string): string {
  return escapeHTML(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
