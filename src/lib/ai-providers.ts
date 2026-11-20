// AI provider abstraction — cheap tier (Gemini Flash-Lite) + smart tier (Gemini 3.8 Flash)
//
// Both model ids and the per-generation request shape live in
// ./gemini-generation-shape. Do NOT re-introduce a bare model literal here:
// this file held three of them, and a model string is what selects the request
// shape, so three copies meant three chances to drift. See that module's header
// for why the smart tier moved off gemini-2.5-pro on 2026-11-20.

import { GoogleGenAI } from '@google/genai';
import {
  GEMINI_CHEAP_MODEL,
  GEMINI_SMART_MODEL,
  geminiTuning,
} from './gemini-generation-shape';

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

// ─── Cheap tier: Gemini 2.5 Flash-Lite ─────────────────────────────────────

async function cheapComplete(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const gemini = getGemini();
  // Cheap tier is still a 2.5 model and is NOT in the deprecation notice, so
  // geminiTuning is the identity here and `temperature` is genuinely honoured.
  // It is routed through the helper anyway so a future model bump cannot
  // silently keep sending the 2.5 shape.
  const response = await gemini.models.generateContent({
    model: GEMINI_CHEAP_MODEL,
    contents: prompt,
    config: geminiTuning(GEMINI_CHEAP_MODEL, {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 1024,
      thinkingConfig: { thinkingBudget: 0 },
      ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {}),
    }),
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI model returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Smart tier: Gemini 2.5 Pro ─────────────────────────────────────────────

async function smartComplete(prompt: string, options?: {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  jsonMode?: boolean;
}): Promise<string> {
  const gemini = getGemini();
  const response = await gemini.models.generateContent({
    model: GEMINI_SMART_MODEL,
    contents: prompt,
    config: geminiTuning(GEMINI_SMART_MODEL, {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 8192,
      // Load-bearing on a 3.x model, and the reason porting a sampling-only
      // guard would NOT have been enough. Omitting thinkingConfig means the
      // 3.x flash default (MEDIUM), i.e. thinking ON — and thought tokens are
      // billed as output AND consume the same maxOutputTokens budget as the
      // answer. Every caller here JSON.parses the result, so a thinking model
      // can truncate mid-JSON and throw "AI model returned invalid JSON",
      // which analyze-panel surfaces verbatim to the user. geminiTuning
      // translates budget 0 -> thinkingLevel LOW for 3.8-flash (MINIMAL is
      // rejected with a 400 on this model).
      thinkingConfig: { thinkingBudget: 0 },
      ...(options?.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
      ...(options?.jsonMode ? { responseMimeType: 'application/json' } : {}),
    }),
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI model returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Streaming smart completion — REMOVED 2026-11-20 ────────────────────────
//
// `smartStream` was deleted during the Gemini Dec-1 retirement sweep. It had
// ZERO callers anywhere in src/ (the repo's own generated docs already recorded
// it as "Defined; not used by any current route"), and it was the only Gemini
// call site with no jsonMode branch — so it was also the one place a model
// change would have gone untested by any manual QA path while still carrying a
// retired `gemini-2.5-pro` literal that a future sweep would have to find.
//
// If streaming is ever wanted back: build it on GEMINI_SMART_MODEL and route
// its config through geminiTuning, exactly like smartComplete above. Do not
// restore the old body — it predates both.
