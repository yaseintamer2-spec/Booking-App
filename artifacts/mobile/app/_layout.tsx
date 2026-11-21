import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { ClerkLoaded, ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useColors } from '@/hooks/useColors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const queryClient = new QueryClient();
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;
if (apiBaseUrl) setBaseUrl(apiBaseUrl);

function RootLayoutNav() {
  const colors = useColors();
  const router = useRouter();
  const lastNotificationResponse = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openMatch = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as { matchId?: unknown; screen?: unknown } | undefined;
      const responseId = response?.notification.request.identifier;
      if (typeof data?.matchId !== 'string' || !responseId || lastNotificationResponse.current === responseId) return;
      lastNotificationResponse.current = responseId;
      if (data.screen === 'referee-matches') router.push('/referee-matches');
      else if (data.screen === 'admin') router.push('/admin');
      else router.push({ pathname: '/match-registration', params: { id: data.matchId } });
      void Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openMatch);
    openMatch(Notifications.getLastNotificationResponse());
    return () => subscription.remove();
  }, [router]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.dataset.kickoffInputFocus = 'true';
    style.textContent = 'input:focus, textarea:focus { outline: none !important; box-shadow: none !important; }';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="match-registration" />
      <Stack.Screen name="match/[id]" />
      <Stack.Screen name="checkout/[id]" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="pitch-owner" />
      <Stack.Screen name="staff-check-in" />
      <Stack.Screen name="referee-matches" />
      <Stack.Screen name="referee-match/[id]" />
    </Stack>
  );
}

function AuthTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(async () => (await getToken()) ?? null);
    return () => setAuthTokenGetter(async () => null);
  }, [getToken]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;
  if (!publishableKey) {
    return (
      <SafeAreaProvider>
        <View style={styles.configurationNotice}>
          <Text style={styles.configurationTitle}>Clerk configuration required</Text>
          <Text style={styles.configurationText}>
            Copy .env.example to .env in artifacts/mobile and add your Clerk development publishable key.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  const app = (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
      <ClerkLoaded>
        <AuthTokenBridge />
        {app}
      </ClerkLoaded>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  configurationNotice: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#0A100E',
  },
  configurationTitle: {
    color: '#F3F7F2',
    fontSize: 20,
    fontWeight: '700',
  },
  configurationText: {
    color: '#A8B5AC',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
});

