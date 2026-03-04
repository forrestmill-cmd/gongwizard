// Token estimation utilities for AI context window guidance

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function contextLabel(tokens: number): string {
  if (tokens < 8000) return 'Small (fits most models)';
  if (tokens < 16000) return 'Medium (GPT-4, Claude Haiku)';
  if (tokens < 128000) return 'Large (GPT-4 Turbo, Claude Opus)';
  if (tokens < 200000) return 'Very large (Claude Sonnet, Gemini)';
  return 'Exceeds typical context windows';
}

export function contextColor(tokens: number): string {
  if (tokens < 32000) return 'text-green-600 dark:text-green-400';
  if (tokens < 128000) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}
