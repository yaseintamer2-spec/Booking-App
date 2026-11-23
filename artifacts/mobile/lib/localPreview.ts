import { Platform } from 'react-native';

/**
 * Use local fixtures in the browser preview when no API origin is configured,
 * or when the app still points at the conventional local API that is often not
 * running alongside Expo. Hosted API origins continue to use real data.
 */
const configuredApiOrigin = process.env.EXPO_PUBLIC_API_URL?.trim();
const apiOrigin = configuredApiOrigin?.replace(/\/+$/, '');
const pointsAtLocalApi = !!apiOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiOrigin);

export const isLocalPreviewMode =
  __DEV__ && Platform.OS === 'web' && (!configuredApiOrigin || pointsAtLocalApi);
