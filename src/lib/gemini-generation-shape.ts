// ── Gemini request shape, per MODEL GENERATION ──────────────────────────────
//
// Ported 2026-11-20 from TripSapien's scripts/lib/gemini-generation-shape.mjs,
// which closed this same class across 28 callers. Chosen over RecipeStripper's
// `samplingConfigFor` deliberately: that helper gates `temperature` ONLY and has
// no thinking handling at all, and the thinking half is the half that bites here
// (see `geminiTuning` below).
//
// Google AI Studio service announcement 2026-10-06 ("Update thinking_budget and
// sampling parameters"): `temperature` / `top_p` / `top_k` are DEPRECATED AND
// IGNORED on every current Gemini 3.x and 4.x general-use model, and supplying
// them "returns an HTTP 400 error" on future model generations. Note the failure
// mode today is SILENT, not loud — a leftover `temperature` does not throw, it
// just stops controlling output, which for anything quality-sensitive is worse
// than a 400 because no test and no log will ever reveal it.
//
// On Gemini 2.5 and older all four fields are correct and load-bearing, so the
// deprecation is NOT "delete these fields" — it is "send the shape the model's
// own generation accepts". `geminiTuning` is the IDENTITY function on a pre-3
// model, so wiring it in changes nothing about what a 2.5 call sends today.
//
// WHY THIS REPO NEEDED IT (2026-11-20). Google deprecated `gemini-2.5-pro` on
// 2026-11-02; from 2026-12-01 the name keeps being ACCEPTED but SERVES
// `gemini-3.8-flash`, billed at its rates. So the analyze pipeline would have
// gone on sending `temperature: 0.3` to a model that ignores it, with no error.
// `gemini-2.5-flash-lite` is NOT in the deprecation notice and is unaffected.
//
// Deliberately NOT a general "strip unknown fields" sanitizer: responseMimeType,
// responseSchema, systemInstruction, maxOutputTokens, tools and abortSignal are
// untouched by the deprecation and must pass through byte-identical.

/** The deprecated sampling knobs, exactly as the announcement lists them. */
export const DEPRECATED_SAMPLING_FIELDS = ['temperature', 'topP', 'topK', 'top_p', 'top_k'] as const;

/**
 * The model every smart-tier call uses.
 *
 * Declared once because the trap this module exists to close is decided per
 * model, and three call sites each hardcoding their own answer is how the
 * answers drift apart — which is exactly the state this file replaced.
 *
 * `gemini-3.8-flash` is Google's own published replacement for the retired
 * `gemini-2.5-pro`. It is also what the retired name auto-routes to from
 * 2026-12-01, so pinning it changes which request SHAPE we send, not which
 * model answers.
 */
export const GEMINI_SMART_MODEL = 'gemini-3.8-flash';

/** The cheap tier. NOT in the deprecation notice — do not "upgrade" it as part
 *  of a retirement sweep; it is unaffected and its 2.5 shape is correct. */
export const GEMINI_CHEAP_MODEL = 'gemini-2.5-flash-lite';

/**
 * Is this model in the generation where the deprecation applies?
 *
 * Parses the leading major version so an unreleased `gemini-4-*` is treated as
 * "3 or newer" rather than silently falling back to the 2.5 shape — the failure
 * we are guarding against is precisely a NEWER model. Tolerates the `models/`
 * prefix, a real form the API accepts.
 */
export function isGemini3OrNewer(model: string): boolean {
  const major = Number(/^(?:models\/)?gemini-(\d+)/.exec(String(model ?? ''))?.[1]);
  return Number.isFinite(major) && major >= 3;
}

/**
 * The LOWEST thinking level `model` actually accepts.
 *
 * Levels are NOT uniform across Gemini 3 and the floor cannot be discovered at
 * runtime — the models endpoint exposes only `thinking: true`, never the level
 * set. Per Google's own docs, `minimal` is "not supported for Gemini 3.8 Flash
 * and will return an error", and is likewise unsupported on the Gemini 4 family;
 * `gemini-3.6-flash` and below do accept it.
 *
 * An UNKNOWN newer model falls back to LOW on purpose. The two ways to be wrong
 * are not symmetric: guessing LOW where MINIMAL existed costs a little latency
 * and some thinking tokens, while guessing MINIMAL where it was removed is a 400
 * and a dead feature. LOW is accepted by every 3.x model.
 */
export function lowestThinkingLevelFor(model: string): 'MINIMAL' | 'LOW' {
  const m = /^(?:models\/)?gemini-(\d+)(?:\.(\d+))?/.exec(String(model ?? ''));
  const major = Number(m?.[1]);
  const minor = Number(m?.[2] ?? 0);
  return major === 3 && minor <= 6 ? 'MINIMAL' : 'LOW';
}

/**
 * The level to send for a given legacy token budget.
 *
 * A budget of 0 means "don't think" -> the model's lowest accepted level. Any
 * POSITIVE budget must keep thinking ON, so it maps to LOW (accepted on every
 * 3.x) and never to the floor — on some models the floor IS MINIMAL, which
 * would silently disable reasoning the caller explicitly asked for. The levels
 * are coarse, so a token count cannot round-trip; LOW is the smallest level
 * that still thinks.
 */
export function thinkingLevelForBudget(budget: number, model: string): 'MINIMAL' | 'LOW' {
  return Number(budget) > 0 ? 'LOW' : lowestThinkingLevelFor(model);
}

type GeminiConfig = Record<string, unknown>;

/**
 * Correct one Gemini request config for `model`.
 *
 * Works for BOTH wire shapes, because they use the same field names: the
 * `@google/genai` SDK's flat `config` object (what this repo passes) and raw
 * REST's `generationConfig`.
 *
 * Returns the SAME object reference on a pre-3 model (identity — no copy, no
 * behaviour change). On Gemini 3+ returns a shallow copy with the sampling
 * fields removed and `thinkingConfig.thinkingBudget` translated to
 * `thinkingLevel`. An explicit `thinkingLevel` the caller already set is
 * respected and never overwritten.
 *
 * WHY THE CALLER MUST STILL PASS A thinkingConfig. This function translates an
 * EXISTING thinking config; it does not invent one. Omitting `thinkingConfig`
 * entirely is NOT the migration — the 3.x flash default is MEDIUM, i.e.
 * thinking ON, and thought tokens are billed as output AND consume the same
 * `maxOutputTokens` budget as the answer. In this repo `batch-run` asks for
 * 16384 output tokens and then `JSON.parse`s the result, so a medium-thinking
 * model can truncate mid-JSON and throw "AI model returned invalid JSON" —
 * which the UI surfaces verbatim to the user before aborting the whole run.
 * Pass `thinkingConfig: { thinkingBudget: 0 }` and let this translate it.
 */
export function geminiTuning<T extends GeminiConfig>(model: string, config: T): T {
  if (!config || typeof config !== 'object') return config;
  if (!isGemini3OrNewer(model)) return config;

  const out: GeminiConfig = { ...config };
  for (const field of DEPRECATED_SAMPLING_FIELDS) delete out[field];

  const thinking = out.thinkingConfig;
  if (thinking && typeof thinking === 'object') {
    const next: Record<string, unknown> = { ...(thinking as Record<string, unknown>) };
    if (next.thinkingLevel === undefined && next.thinkingBudget !== undefined) {
      next.thinkingLevel = thinkingLevelForBudget(Number(next.thinkingBudget), model);
    }
    delete next.thinkingBudget;
    out.thinkingConfig = next;
  }
  return out as T;
}
