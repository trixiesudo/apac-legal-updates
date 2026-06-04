import type { Digest } from './emailDigestService';

const HISTORY_KEY = 'routingDigestHistory';

export function loadDigestHistory(): Digest[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDigestHistory(history: Digest[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
}

export function upsertDigest(history: Digest[], digest: Digest): Digest[] {
  return [digest, ...history.filter((item) => item.id !== digest.id)].slice(0, 30);
}

export function findDigest(history: Digest[], id: string): Digest | undefined {
  return history.find((digest) => digest.id === id);
}
