import type { GongUser, GongCallParty } from './types';

export function buildInternalDomainSet(users: GongUser[]): string[] {
  const domains = new Set<string>();
  for (const user of users) {
    if (user.emailAddress) {
      const domain = getEmailDomain(user.emailAddress);
      if (domain) domains.add(domain);
    }
  }
  return Array.from(domains);
}

export function classifySpeaker(
  party: GongCallParty,
  internalDomains: string[]
): 'internal' | 'external' {
  if (party.affiliation === 'Internal') return 'internal';
  if (party.affiliation === 'External') return 'external';

  if (party.emailAddress) {
    const domain = getEmailDomain(party.emailAddress);
    if (domain) {
      if (internalDomains.includes(domain)) return 'internal';
      if (internalDomains.some((d) => domain.endsWith('.' + d))) return 'internal';
    }
  }

  return 'external';
}

function getEmailDomain(email: string): string {
  if (!email || !email.includes('@')) return '';
  return email.split('@').pop()?.trim().toLowerCase() || '';
}
