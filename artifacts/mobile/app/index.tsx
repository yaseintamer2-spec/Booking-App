import React, { useEffect } from 'react';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function EntryRoute() {
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <Redirect href="/match-registration" />;
  }

  return <AuthenticatedEntryRoute />;
}

function AuthenticatedEntryRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();
  if (!isLoaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <Redirect href={isSignedIn ? '/(tabs)' : '/(auth)/welcome'} />;
}
