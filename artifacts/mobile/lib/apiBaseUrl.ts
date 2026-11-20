import { Platform } from 'react-native';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const apiBaseUrl = (
  configuredApiUrl || (Platform.OS === 'web' && __DEV__ ? 'http://localhost:5000' : '')
).replace(/\/+$/, '');
