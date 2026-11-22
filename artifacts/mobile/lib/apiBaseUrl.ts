import { Platform } from 'react-native';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const apiBaseUrl = (
  configuredApiUrl || (Platform.OS === 'web' && __DEV__ ? 'http://localhost:5000' : '')
).replace(/\/+$/, '');

export function explainApiConnectionError(error: unknown, fallback: string): string {
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    const target = apiBaseUrl || 'the current app host';
    return `Could not reach the match API at ${target}. Make sure the API server is running and EXPO_PUBLIC_API_URL points to its origin.`;
  }
  return error instanceof Error ? error.message : fallback;
}
