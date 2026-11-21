import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useUser } from '@clerk/expo';
import { AccountMenu } from '@/components/AccountMenu';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  return <><Tabs screenOptions={{
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
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarButton: (props) => <Pressable accessibilityRole="button" accessibilityLabel="Open account menu" accessibilityState={props.accessibilityState} onPress={() => setAccountMenuVisible(true)} style={props.style}>{props.children}</Pressable>, tabBarIcon: ({ color }) => user?.imageUrl ? <Image source={{ uri: user.imageUrl }} accessibilityLabel="Your profile picture" style={{ width: 31, height: 31, borderRadius: 16, borderWidth: 2, borderColor: color, marginTop: -5 }} /> : <Feather name="user" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
  </Tabs><AccountMenu visible={accountMenuVisible} onClose={() => setAccountMenuVisible(false)} /></>;
}

