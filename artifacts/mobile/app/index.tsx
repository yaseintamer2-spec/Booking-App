import React, { useEffect } from 'react';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function EntryRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useColors();
  if (!isLoaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <Redirect href={isSignedIn ? '/(tabs)' : '/(auth)/welcome'} />;
}
