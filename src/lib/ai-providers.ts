// AI provider abstraction — cheap tier (Gemini Flash-Lite) + smart tier (Gemini 2.5 Pro)

import { GoogleGenAI } from '@google/genai';

// ─── Shared Gemini client ────────────────────────────────────────────────────

let _gemini: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

// ─── Cheap tier: Gemini Flash-Lite ──────────────────────────────────────────

export async function cheapComplete(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const gemini = getGemini();
  const response = await gemini.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: prompt,
    config: {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 1024,
      ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const text = response.text ?? '';
  if (!text) throw new Error('AI model returned empty response');
  return text;
}

export async function cheapCompleteJSON<T = unknown>(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const text = await cheapComplete(prompt, { ...options, jsonMode: true });
  if (!text) throw new Error('AI model returned empty response');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI model returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Smart tier: Gemini 2.5 Pro ─────────────────────────────────────────────

export async function smartComplete(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}): Promise<string> {
  const gemini = getGemini();
  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: prompt,
    config: {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 8192,
      ...(options?.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
      ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const text = response.text ?? '';
  if (!text) throw new Error('AI model returned empty response');
  return text;
}

export async function smartCompleteJSON<T = unknown>(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): Promise<T> {
  const text = await smartComplete(prompt, { ...options, jsonMode: true });
  if (!text) throw new Error('AI model returned empty response');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI model returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Streaming smart completion ─────────────────────────────────────────────

export async function* smartStream(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): AsyncGenerator<string> {
  const gemini = getGemini();
  const stream = await gemini.models.generateContentStream({
    model: 'gemini-2.5-pro',
    contents: prompt,
    config: {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 8192,
      ...(options?.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
    },
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}
