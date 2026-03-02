// Token estimation utilities for AI context window guidance

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function contextLabel(tokens: number): string {
  if (tokens < 8000) return 'Fits GPT-3.5 (8K)';
  if (tokens < 16000) return 'Fits Claude Haiku (16K)';
  if (tokens < 32000) return 'Fits ChatGPT Plus (32K)';
  if (tokens < 128000) return 'Fits GPT-4o / Claude (128K)';
  if (tokens < 200000) return 'Fits Claude (200K)';
  return 'Exceeds most context windows';
}

export function contextColor(tokens: number): string {
  if (tokens < 32000) return 'text-green-600 dark:text-green-400';
  if (tokens < 128000) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}
