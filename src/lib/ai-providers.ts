// AI provider abstraction — cheap tier (Gemini) + smart tier (GPT-4o)

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// ─── Cheap tier: Gemini Flash-Lite ──────────────────────────────────────────

let _gemini: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not configured');
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

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

export async function cheapCompleteJSON<T = any>(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const text = await cheapComplete(prompt, { ...options, jsonMode: true });
  if (!text) throw new Error('AI model returned empty response');
  return JSON.parse(text);
}

// ─── Smart tier: GPT-4o ─────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not configured');
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

export async function smartComplete(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}): Promise<string> {
  const openai = getOpenAI();
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  const text = response.choices[0]?.message?.content ?? '';
  if (!text) throw new Error('AI model returned empty response');
  return text;
}

export async function smartCompleteJSON<T = any>(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): Promise<T> {
  const text = await smartComplete(prompt, { ...options, jsonMode: true });
  if (!text) throw new Error('AI model returned empty response');
  return JSON.parse(text);
}

// ─── Streaming smart completion ─────────────────────────────────────────────

export async function* smartStream(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}): AsyncGenerator<string> {
  const openai = getOpenAI();
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

