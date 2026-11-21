import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '@/data/legalDocuments';

const STORAGE_KEY_PREFIX = 'kickoff:legal-acceptance:v1:';

type StoredAcceptance = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
};

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

export async function hasCurrentLocalAcceptance(userId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const value = JSON.parse(raw) as Partial<StoredAcceptance>;
    return value.termsVersion === LEGAL_TERMS_VERSION && value.privacyVersion === LEGAL_PRIVACY_VERSION;
  } catch {
    return false;
  }
}

export async function storeLocalAcceptance(userId: string): Promise<void> {
  const value: StoredAcceptance = {
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(value));
}

export async function clearLocalAcceptance(userId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
}
