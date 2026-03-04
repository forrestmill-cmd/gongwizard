// Token estimation utilities for AI context window guidance

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

