import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function key(storyId: string, releaseId?: string) {
  return `eudora-moon-reading-position:${storyId}:${releaseId ?? 'current'}`;
}

export async function loadReadingPosition(storyId: string, releaseId?: string) {
  const storageKey = key(storyId, releaseId);
  const raw = Platform.OS === 'web'
    ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey))
    : await SecureStore.getItemAsync(storageKey);
  const page = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(page) && page >= 0 ? page : 0;
}

export function saveReadingPosition(storyId: string, page: number, releaseId?: string) {
  const storageKey = key(storyId, releaseId);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, String(page));
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(storageKey, String(page));
}
