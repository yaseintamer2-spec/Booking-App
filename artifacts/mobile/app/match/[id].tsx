import React, { useEffect, useRef, useState } from 'react';
import { ImageBackground, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, getGetMatchQueryKey, useGetCurrentUser, useGetMatch } from '@workspace/api-client-react';
import { BrandHeader, Button, EmptyState, LoadingState, Screen, formatRiyadhDate, formatRiyadhTime, formatSar, heroImage } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const colors = useColors();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const match = useGetMatch(id || '', { query: { queryKey: getGetMatchQueryKey(id || ''), enabled: !!id } });
  const date = match.data ? new Date(match.data.startsAt) : null;
  const photos = match.data?.imageUrls?.length
    ? match.data.imageUrls.slice(0, 3)
    : match.data?.imageUrl && (/^https:\/\//i.test(match.data.imageUrl) || /^data:image\//i.test(match.data.imageUrl))
      ? [match.data.imageUrl]
      : [];
  const gallery = photos.length ? photos : [null];
  const [activePhoto, setActivePhoto] = useState(0);
  const [photoWidth, setPhotoWidth] = useState(320);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    setActivePhoto(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [match.data?.id, match.data?.imageUrls, match.data?.imageUrl]);

  useEffect(() => {
    if (gallery.length < 2) return;
    const timer = setInterval(() => setActivePhoto(current => {
      const next = (current + 1) % gallery.length;
      scrollRef.current?.scrollTo({ x: next * photoWidth, animated: true });
      return next;
    }), 5000);
    return () => clearInterval(timer);
  }, [gallery.length, photoWidth]);

  const goToPhoto = (index: number) => {
    setActivePhoto(index);
    scrollRef.current?.scrollTo({ x: index * photoWidth, animated: true });
  };
  return <Screen><BrandHeader back backFallback="/(tabs)/matches" user={user.data} subtitle="MATCH DETAILS" />
    {match.isLoading ? <LoadingState /> : match.isError || !match.data ? <EmptyState icon="alert-circle" title="This match isn't available." body="It may have been removed or is no longer published. Head back to Discover to see current games." action={match.isError ? 'Try again' : undefined} onAction={() => match.refetch()} /> : <>
       <View style={styles.gallery} onLayout={event => setPhotoWidth(event.nativeEvent.layout.width)}>
         <ScrollView
           ref={scrollRef}
           horizontal
           pagingEnabled
           nestedScrollEnabled
           showsHorizontalScrollIndicator={false}
           onMomentumScrollEnd={event => setActivePhoto(Math.min(gallery.length - 1, Math.round(event.nativeEvent.contentOffset.x / photoWidth)))}
         >
           {gallery.map((photo, index) => (
             <ImageBackground
               key={`${index}-${photo?.slice(0, 22) || 'default'}`}
               source={photo ? { uri: photo } : heroImage}
               style={[styles.cover, { width: photoWidth }]}
               imageStyle={{ borderRadius: 20 }}
             >
               <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,12,7,0.36)', borderRadius: 20 }]} />
               <View style={[styles.pill, { backgroundColor: match.data.isDemo ? colors.destructive : colors.primary }]}>
                 <Text style={[styles.pillText, { color: match.data.isDemo ? colors.destructiveForeground : colors.primaryForeground }]}>
                   {match.data.isDemo ? 'DEMO LISTING · 7V7' : 'OPEN GAME · 7V7'}
                 </Text>
               </View>
               <View style={styles.coverText}>
                 <Text style={[styles.title, { color: colors.foreground }]}>{match.data.venueName}</Text>
                 <Text style={[styles.location, { color: colors.secondaryForeground }]}>{match.data.neighborhood}  ·  RIYADH</Text>
               </View>
             </ImageBackground>
           ))}
         </ScrollView>
       </View>
       {photos.length > 1 ? (
         <View style={styles.galleryDots}>
           {photos.map((_, index) => (
             <Pressable
               key={index}
               accessibilityRole="button"
               accessibilityLabel={`Show pitch photo ${index + 1} of ${photos.length}`}
               onPress={() => goToPhoto(index)}
               style={styles.galleryDotHit}
             >
               <View style={[styles.galleryDot, { backgroundColor: index === activePhoto ? colors.googleBlue : 'rgba(232,238,233,.72)' }]} />
             </Pressable>
           ))}
         </View>
       ) : null}
       <Text style={[styles.kicker, { color: colors.primary }]}>YOUR NEXT TWO HOURS</Text><Text style={[styles.heading, { color: colors.foreground }]}>{date ? formatRiyadhDate(date) : ''}</Text>
       <View style={[styles.timeCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.timeBlock}><Text style={[styles.label, { color: colors.mutedForeground }]}>KICKOFF · RIYADH</Text><Text style={[styles.time, { color: colors.foreground }]}>{date ? formatRiyadhTime(date) : ''}</Text></View><View style={[styles.vertical, { backgroundColor: colors.border }]} /><View style={styles.timeBlock}><Text style={[styles.label, { color: colors.mutedForeground }]}>DURATION</Text><Text style={[styles.time, { color: colors.foreground }]}>{match.data.durationMinutes === 120 ? '2 hours' : `${match.data.durationMinutes} min`}</Text></View></View>
      <View style={[styles.details, { borderColor: colors.border }]}><DetailRow icon="map-pin" label="VENUE" value={match.data.address} colors={colors} /><DetailRow icon="users" label="FORMAT" value={`${match.data.format} · ${match.data.capacity} players`} colors={colors} /><DetailRow icon="user-check" label="PLAYERS" value={`${match.data.spotsRemaining} spots remaining`} colors={colors} /><DetailRow icon="shield" label="REFEREE" value={match.data.refereeIncluded ? 'Included in the match' : 'Not included'} colors={colors} /><DetailRow icon="droplet" label="WATER" value={match.data.waterIncluded ? 'Provided at the pitch' : 'Please bring your own'} colors={colors} /></View>
       <View style={[styles.priceRow, { borderColor: colors.border }]}><View><Text style={[styles.label, { color: colors.mutedForeground }]}>PER PLAYER</Text><View style={styles.priceText}><View>{match.data.compareAtPriceHalalas > match.data.priceHalalas ? <Text style={[styles.compare, { color: colors.destructive }]}>{formatSar(match.data.compareAtPriceHalalas)}</Text> : null}<Text style={[styles.price, { color: colors.foreground }]}>{formatSar(match.data.priceHalalas)}</Text></View></View></View><Text style={[styles.included, { color: colors.primary }]}>ALL SET. ALL INCLUDED.</Text></View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}><Pressable accessibilityRole="button" onPress={() => { if (!date) return; const end = new Date(date.getTime() + match.data!.durationMinutes * 60_000); const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); const params = new URLSearchParams({ action: 'TEMPLATE', text: `Football at ${match.data!.venueName}`, dates: `${stamp(date)}/${stamp(end)}`, location: `${match.data!.address}, ${match.data!.neighborhood}, Riyadh` }); void Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`); }} style={{ flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderColor: colors.border, backgroundColor: colors.card }}><Feather name="calendar" size={16} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 10, fontWeight: '700' }}>Add to calendar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `${match.data!.venueName} · ${match.data!.neighborhood}\n${date ? formatRiyadhDate(date) : ''} at ${date ? formatRiyadhTime(date) : ''} Riyadh\nJoin me for a 7v7 game on KORZA | كورزا.` })} style={{ flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderColor: colors.border, backgroundColor: colors.card }}><Feather name="share-2" size={16} color={colors.primary} /><Text style={{ color: colors.foreground, fontSize: 10, fontWeight: '700' }}>Share invite</Text></Pressable></View>
      <View style={{ marginTop: 12 }}><Button label="View lineup & join" onPress={() => router.push({ pathname: '/match-registration', params: { id } })} icon="arrow-right" /></View>
    </>}
  </Screen>;
}
function DetailRow({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.detailRow}><Feather name={icon as never} size={16} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text></View></View>;
}
const styles = StyleSheet.create({
  gallery: { height: 235, overflow: 'hidden', borderRadius: 20 },
  cover: { height: 235, borderRadius: 20, overflow: 'hidden', justifyContent: 'space-between', padding: 17 },
  galleryDots: { height: 34, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  galleryDotHit: { minWidth: 36, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  galleryDot: { width: 7, height: 7, borderRadius: 4 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20 },
  pillText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  coverText: { gap: 5 },
  title: { fontFamily: 'Georgia', fontSize: 28 },
  location: { fontSize: 10, letterSpacing: 1 },
  kicker: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700', marginTop: 23 },
  heading: { fontSize: 22, fontFamily: 'Georgia', marginTop: 7 },
  timeCard: { borderWidth: 1, borderRadius: 16, padding: 17, flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  timeBlock: { flex: 1, gap: 7 },
  label: { fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },
  time: { fontSize: 17, fontWeight: '700' },
  vertical: { width: 1, height: 38, marginHorizontal: 15 },
  details: { borderTopWidth: 1, borderBottomWidth: 1, marginTop: 19, paddingVertical: 6 },
  detailRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.9 },
  detailValue: { fontSize: 12, marginTop: 3 },
  priceRow: { borderBottomWidth: 1, paddingVertical: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceText: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  price: { fontSize: 21, fontWeight: '700' },
  compare: { textDecorationLine: 'line-through', fontSize: 12 },
  included: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
});
