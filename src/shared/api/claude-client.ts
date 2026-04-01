import { getExplanationSystemPrompt, buildExplanationUserMessage } from '../prompts/explanation-prompt';

// === Provider detection ===

interface Provider {
  name: string;
  endpoint: string;
  model: string;
  format: 'anthropic' | 'openai';
  headers: (apiKey: string) => Record<string, string>;
}

function detectProvider(apiKey: string): Provider {
  if (apiKey.startsWith('sk-ant-')) {
    return {
      name: 'Claude',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-haiku-4-5-20251001',
      format: 'anthropic',
      headers: (key) => ({
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }),
    };
  }

  if (apiKey.startsWith('AIza')) {
    return {
      name: 'Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-2.0-flash',
      format: 'openai',
      headers: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
    };
  }

  // DeepSeek keys are typically longer and start with sk-
  // OpenAI keys also start with sk- but are shorter format
  // Both use OpenAI-compatible format, so we check endpoint reachability
  // Heuristic: DeepSeek keys tend to be 50+ chars, OpenAI keys ~51 chars with sk-proj- prefix
  if (apiKey.startsWith('sk-proj-') || apiKey.startsWith('sk-org-')) {
    return {
      name: 'GPT',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      format: 'openai',
      headers: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
    };
  }

  // Other sk- keys: could be OpenAI legacy or DeepSeek
  // DeepSeek keys are typically 50+ chars without sub-prefix
  // OpenAI legacy keys are shorter, but we can't reliably distinguish
  // Default to OpenAI (more common), user can always use DeepSeek with its specific format
  if (apiKey.startsWith('sk-')) {
    return {
      name: 'GPT',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      format: 'openai',
      headers: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
    };
  }

  // Keys starting with "ds-" or containing "deepseek" → DeepSeek
  if (apiKey.toLowerCase().includes('deepseek') || apiKey.startsWith('ds-')) {
    return {
      name: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      format: 'openai',
      headers: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }),
    };
  }

  // Fallback: try OpenAI
  return {
    name: 'AI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    format: 'openai',
    headers: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
  };
}

export function getProviderName(apiKey: string): string {
  return detectProvider(apiKey).name;
}

// === Streaming ===

const MAX_TOKENS = 2048;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function readAnthropicStream(
  resp: Response,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) { onError('Empty response body'); return; }

  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            onChunk(event.delta.text);
          } else if (event.type === 'message_stop') {
            finished = true;
            onDone();
            return;
          }
        } catch { /* skip */ }
      }
    }
  } finally {
    if (!finished) onDone();
  }
}

async function readOpenAIStream(
  resp: Response,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) { onError('Empty response body'); return; }

  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') {
          if (data === '[DONE]') { finished = true; onDone(); return; }
          continue;
        }
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch { /* skip */ }
      }
    }
  } finally {
    if (!finished) onDone();
  }
}

async function streamRequest(
  apiKey: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  const provider = detectProvider(apiKey);

  try {
    let body: string;

    if (provider.format === 'anthropic') {
      body = JSON.stringify({
        model: provider.model,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        stream: true,
      });
    } else {
      // OpenAI-compatible format (GPT, DeepSeek, Gemini)
      const openaiMessages: ChatMessage[] = [
        { role: 'system', content: system },
        ...messages,
      ];
      body = JSON.stringify({
        model: provider.model,
        max_tokens: MAX_TOKENS,
        messages: openaiMessages,
        stream: true,
      });
    }

    const resp = await fetch(provider.endpoint, {
      method: 'POST',
      headers: provider.headers(apiKey),
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      onError(`${provider.name} API error ${resp.status}: ${text}`);
      return;
    }

    if (provider.format === 'anthropic') {
      await readAnthropicStream(resp, onChunk, onDone, onError);
    } else {
      await readOpenAIStream(resp, onChunk, onDone, onError);
    }
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}

// === Public API ===

export async function streamExplanation(
  apiKey: string,
  selectedText: string,
  context: string,
  pageUrl: string,
  pageTitle: string,
  targetLang: 'zh-CN' | 'zh-TW',
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  await streamRequest(
    apiKey,
    getExplanationSystemPrompt(targetLang),
    [{ role: 'user', content: buildExplanationUserMessage(selectedText, context, pageUrl, pageTitle) }],
    onChunk, onDone, onError,
  );
}

export async function streamFollowUp(
  apiKey: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  followUpQuestion: string,
  targetLang: 'zh-CN' | 'zh-TW',
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  await streamRequest(
    apiKey,
    getExplanationSystemPrompt(targetLang),
    [...conversationHistory, { role: 'user', content: followUpQuestion }],
    onChunk, onDone, onError,
  );
}
