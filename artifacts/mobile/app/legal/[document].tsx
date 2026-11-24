import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BrandHeader, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { legalDocuments } from '@/data/legalDocuments';

export default function LegalDocumentScreen() {
  const colors = useColors();
  const { document } = useLocalSearchParams<{ document: string }>();
  const content = legalDocuments[document ?? ''];
  if (!content) return <Screen><BrandHeader back backFallback="/settings" /><Text style={{ color: colors.foreground }}>This page could not be found.</Text></Screen>;
  return <Screen>
    <BrandHeader back backFallback="/settings" hideMenu />
    <Text style={[styles.eyebrow, { color: colors.primary }]}>{content.eyebrow}</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>{content.title}</Text>
    <Text style={[styles.updated, { color: colors.mutedForeground }]}>Version 1 · Updated {content.updated}</Text>
    <View style={[styles.draftNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="info" size={16} color={colors.primary} />
      <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>Review draft. Business identity, contact details, data-retention periods, provider locations, and final policies must be confirmed before public launch.</Text>
    </View>
    {content.sections.map((section) => <View key={section.heading} style={styles.section}>
      <Text style={[styles.heading, { color: colors.foreground }]}>{section.heading}</Text>
      {section.body.map((paragraph, index) => <Text key={index} style={[styles.body, { color: colors.mutedForeground }]}>{paragraph}</Text>)}
    </View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 12, letterSpacing: 0.6, fontWeight: '800', marginTop: 18 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '800', marginTop: 7 },
  updated: { fontSize: 13, marginTop: 8 },
  draftNotice: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 20 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  section: { marginTop: 24 }, heading: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22, marginBottom: 10 },
});
