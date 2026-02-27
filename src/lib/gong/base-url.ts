const DEFAULT_BASE_URL = 'https://api.gong.io';

export function getDefaultBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

export function parseBaseUrl(responseData: Record<string, unknown>): string | null {
  const baseUrl = responseData?.api_base_url_for_customer;
  if (typeof baseUrl === 'string' && baseUrl.startsWith('http')) {
    return baseUrl.replace(/\/+$/, '');
  }
  return null;
}

export function buildApiUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}
