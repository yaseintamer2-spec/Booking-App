import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarStyle: { position: 'absolute', backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background, borderTopColor: colors.border, borderTopWidth: 1, height: Platform.OS === 'web' ? 84 : 58 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(4, insets.bottom), elevation: 0 },
    tabBarBackground: () => Platform.OS === 'ios' ? <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />,
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Feather name="home" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="matches" options={{ title: 'Discover', tabBarIcon: ({ color }) => <Feather name="search" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="my-matches" options={{ title: 'My matches', tabBarIcon: ({ color }) => <Feather name="calendar" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="rankings" options={{ title: 'Rankings', tabBarIcon: ({ color }) => <Feather name="award" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Feather name="user" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
  </Tabs>;
}
