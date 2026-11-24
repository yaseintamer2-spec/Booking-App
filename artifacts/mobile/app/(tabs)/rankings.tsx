import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function RankingsScreen() {
  const colors = useColors();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });

  return <Screen>
    <BrandHeader user={user.data} subtitle="RIYADH" />
    <View style={styles.heading}>
      <Text style={[styles.title, { color: colors.foreground }]}>Player rankings</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>Goals, wins, and fair-play records will come from completed match stats.</Text>
    </View>
    <EmptyState icon="award" title="No rankings yet." body="The table will fill in when referees record results from completed matches." />
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { marginTop: 8, marginBottom: 4 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 20, marginTop: 5 },
});
