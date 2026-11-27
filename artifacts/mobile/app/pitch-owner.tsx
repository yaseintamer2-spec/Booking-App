import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { BrandHeader, Button, EmptyState, Field, LoadingState, Screen, formatRiyadhDateTime, formatSar, parseRiyadhLocalInput, toRiyadhLocalInput } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useColors } from '@/hooks/useColors';
import { uploadMatchImages } from '@/lib/matchImageUpload';
import { MatchAgeGroupPicker } from '@/components/MatchAgeGroupPicker';
import type { MatchAgeGroup } from '@/lib/matchAge';
import { isGoogleMapsUrl } from '@workspace/api-zod';

type Pitch = { email: string; venueName: string; neighborhood: string; address: string; canManageAnyPitch?: boolean };
type Submission = { id: string; venueName: string; neighborhood: string; address: string; contactPhone: string; startsAt: string; durationMinutes: number; capacity: number; ageGroup: MatchAgeGroup; rentalPriceHalalas: number | null; waterIncluded: boolean; imageUrls: string[]; status: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; matchId: string | null };
type Form = { venueName: string; neighborhood: string; address: string; startsAt: string; capacity: string; ageGroup: MatchAgeGroup; rentalPrice: string; contactPhone: string; waterIncluded: boolean; imageUrls: string[] };
const freshForm = (): Form => ({ venueName: '', neighborhood: '', address: '', startsAt: toRiyadhLocalInput(new Date(Date.now() + 2 * 86400000)), capacity: '14', ageGroup: '13-16', rentalPrice: '', contactPhone: '', waterIncluded: true, imageUrls: [] });

export default function PitchOwnerScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth();
  const [pitch, setPitch] = useState<Pitch | null>(null); const [submissions, setSubmissions] = useState<Submission[]>([]); const [form, setForm] = useState<Form>(freshForm); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetchWithTimeout(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(body?.error || 'Could not complete the pitch request.');
    return body;
  }, [getToken]);
  const load = useCallback(async () => {
    try {
      const [assignment, history] = await Promise.all([request('/me/pitch-owner'), request('/pitch-owner/submissions')]);
      setPitch(assignment); setSubmissions(history); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your pitch.'); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { void load(); }, [load]);
  const change = (key: keyof Form, value: string | boolean | string[] | MatchAgeGroup) => setForm((old) => ({ ...old, [key]: value }));
  const addPhotos = async () => {
    const remaining = 3 - form.imageUrls.length;
    if (!remaining) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: .4, base64: true });
    if (result.canceled) return;
    const images = result.assets.flatMap((asset) => asset.base64 ? [`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`] : []);
    const imageUrls = [...form.imageUrls, ...images].slice(0, 3);
    if (!images.length) { setError('Those photos could not be prepared. Choose another image format.'); return; }
    if (imageUrls.some((image) => image.length > 1_450_000) || imageUrls.reduce((sum, image) => sum + image.length, 0) > 4_200_000) { setError('Choose smaller photos. Up to three compressed pitch photos are supported.'); return; }
    change('imageUrls', imageUrls); setError('');
  };
  const submit = async () => {
    setError('');
    const startsAt = parseRiyadhLocalInput(form.startsAt);
    const capacity = Number(form.capacity);
    const rentalPriceHalalas = Math.round(Number(form.rentalPrice) * 100);
    if (!startsAt || startsAt.getTime() <= Date.now()) { setError('Choose a future date and time in Riyadh time.'); return; }
    if (form.address.trim().length > 300 || !isGoogleMapsUrl(form.address.trim())) { setError('Paste a valid HTTPS Google Maps link for the pitch location.'); return; }
    if (pitch?.canManageAnyPitch && (!form.venueName.trim() || !form.neighborhood.trim())) { setError('Add the pitch name and area.'); return; }
    if (!/^\+?[0-9][0-9 ()-]{7,18}$/.test(form.contactPhone.trim())) { setError('Enter a contact phone number so the team can reach you.'); return; }
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 30) { setError('Choose a player capacity between 2 and 30.'); return; }
    if (!/^\d+(?:\.\d{1,2})?$/.test(form.rentalPrice.trim()) || !Number.isSafeInteger(rentalPriceHalalas) || rentalPriceHalalas <= 0 || rentalPriceHalalas > 2_147_483_647) { setError('Enter the pitch rental cost in SAR, up to two decimal places.'); return; }
    setBusy(true);
    try {
      const imageUrls = await uploadMatchImages(form.imageUrls, getToken);
      await request('/pitch-owner/submissions', { method: 'POST', body: JSON.stringify({ ...(pitch?.canManageAnyPitch ? { venueName: form.venueName.trim(), neighborhood: form.neighborhood.trim() } : {}), address: form.address.trim(), startsAt: startsAt.toISOString(), capacity, ageGroup: form.ageGroup, rentalPriceHalalas, contactPhone: form.contactPhone.trim(), waterIncluded: form.waterIncluded, imageUrls }) });
      setForm(freshForm()); await load();
      Alert.alert('Request sent', 'Your match time is now waiting for admin review. It will appear in Discover only after approval.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit the match request.'); }
    finally { setBusy(false); }
  };
  if (loading) return <Screen><BrandHeader back subtitle="PITCH OWNER DESK" /><LoadingState /></Screen>;
  if (!pitch) return <Screen><BrandHeader back subtitle="PITCH OWNER DESK" /><EmptyState icon="lock" title="Pitch owner access needed." body={error || 'Ask KICKOFF to assign your account to a pitch.'} /></Screen>;
  return <Screen refreshing={false} onRefresh={() => { void load(); }}>
    <BrandHeader back subtitle="PITCH OWNER DESK" />
    <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{pitch.canManageAnyPitch ? 'Pitch owner desk' : pitch.venueName}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{pitch.canManageAnyPitch ? 'Create a match request or scan tickets for check-in.' : `${pitch.neighborhood} · ${pitch.address}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in' as never)} style={({ pressed }) => [styles.scanButton, { backgroundColor: colors.primary, opacity: pressed ? .82 : 1 }]}><Feather name="camera" size={16} color={colors.primaryForeground} /><Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: '800' }}>Scan player check-in</Text><Feather name="arrow-up-right" size={14} color={colors.primaryForeground} /></Pressable>
    </View>
    <View style={[styles.quickStats, { borderColor: colors.border }]}>
      <QuickStat label="Needs review" value={String(submissions.filter((item) => item.status === 'pending').length)} tone={colors.orange} colors={colors} />
      <QuickStat label="Approved" value={String(submissions.filter((item) => item.status === 'approved').length)} tone={colors.primary} colors={colors} />
      <QuickStat label="Requests" value={String(submissions.length)} tone={colors.violet} colors={colors} />
    </View>
    <View style={[styles.reviewNotice, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.noticeIcon, { backgroundColor: colors.secondary }]}><Feather name="clock" size={16} color={colors.primary} /></View>    <Text style={[styles.noticeCopy, { color: colors.mutedForeground }]}>Every match is two hours and includes a referee. Submit the exact Riyadh date/time, pitch rental cost, and Google Maps location; an admin will set the player ticket price when approving it.</Text></View>
    <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Propose a match</Text>
      {pitch.canManageAnyPitch ? <><Field label="PITCH NAME" value={form.venueName} onChangeText={(value) => change('venueName', value)} placeholder="Pitch name" /><Field label="AREA" value={form.neighborhood} onChangeText={(value) => change('neighborhood', value)} placeholder="Neighborhood" /></> : null}
      <Field label="GOOGLE MAPS LINK" value={form.address} onChangeText={(value) => change('address', value)} placeholder="https://maps.app.goo.gl/…" autoCapitalize="none" autoCorrect={false} />
      <Text style={[styles.addressHint, { color: colors.mutedForeground }]}>Paste a Google Maps link only. Players can use it to open directions.</Text>
      <RiyadhDateTimeFields value={form.startsAt} onChange={(value) => change('startsAt', value)} colors={colors} />
      <Field label="CONTACT PHONE" value={form.contactPhone} onChangeText={(value) => change('contactPhone', value)} placeholder="+966 5X XXX XXXX" keyboardType="phone-pad" autoComplete="off" />
      <Text style={[styles.formGroupTitle, { color: colors.primary }]}>PLAYER AGE GROUP</Text><MatchAgeGroupPicker value={form.ageGroup} onChange={(ageGroup) => change('ageGroup', ageGroup)} />
      <Text style={[styles.fixedDuration, { color: colors.mutedForeground }]}>MATCH DURATION · 2 HOURS</Text>
      <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="PLAYERS" value={form.capacity} onChangeText={(value) => change('capacity', value)} placeholder="14" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="PITCH RENTAL · SAR" value={form.rentalPrice} onChangeText={(value) => change('rentalPrice', value)} placeholder="250" /></View></View>
      <Text style={[styles.formGroupTitle, { color: colors.primary }]}>PITCH PHOTOS · {form.imageUrls.length}/3</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: -8, marginBottom: 10 }]}>These use the same rotating photo gallery as other match cards.</Text>
      <View style={styles.photoRow}>{form.imageUrls.map((uri, index) => <View key={`${index}-${uri.slice(0, 24)}`} style={styles.photoWrap}><Image source={{ uri }} style={styles.photo} /><Pressable accessibilityRole="button" accessibilityLabel={`Remove pitch photo ${index + 1}`} onPress={() => change('imageUrls', form.imageUrls.filter((_, item) => item !== index))} style={[styles.photoRemove, { backgroundColor: colors.background }]}><Feather name="x" size={14} color={colors.foreground} /></Pressable></View>)}{form.imageUrls.length < 3 ? <Pressable accessibilityRole="button" onPress={() => void addPhotos()} style={[styles.addPhoto, { borderColor: colors.border }]}><Feather name="image" size={18} color={colors.primary} /><Text style={[styles.meta, { color: colors.foreground, marginTop: 0 }]}>Add photos</Text></Pressable> : null}</View>
      <OwnerToggle label="Water included" value={form.waterIncluded} onPress={() => change('waterIncluded', !form.waterIncluded)} colors={colors} />
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <Button label={busy ? 'Sending for review…' : 'Submit match for approval'} onPress={() => void submit()} disabled={busy} icon="send" />
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>Approval publishes the match in Discover with the same match card and registration screen as other games.</Text>
    </View>
    <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 22 }]}>Your match requests</Text>
    {submissions.length ? submissions.map((item) => <View key={item.id} style={[styles.submissionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.submissionTop}><View style={{ flex: 1 }}><Text style={[styles.submissionDate, { color: colors.foreground }]}>{formatRiyadhDateTime(item.startsAt)}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>2 hours · {item.capacity} players · ages {item.ageGroup.replace('-', '–')} · pitch rental {item.rentalPriceHalalas === null ? 'not recorded' : formatSar(item.rentalPriceHalalas)}</Text></View><View style={[styles.statusPill, { backgroundColor: item.status === 'approved' ? colors.accent : colors.secondary }]}><Text style={[styles.statusText, { color: item.status === 'approved' ? colors.primary : colors.mutedForeground }]}>{item.status.toUpperCase()}</Text></View></View>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>Contact: {item.contactPhone}</Text>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open map for ${item.venueName}`} onPress={() => void Linking.openURL(/^https?:\/\//i.test(item.address) ? item.address : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.venueName}, ${item.address}, Riyadh`)}`)} style={styles.addressLink}><Feather name="map" size={17} color={colors.cyan} /><View style={{ flex: 1 }}><Text style={[styles.addressCaption, { color: colors.cyan }]}>PITCH LOCATION · OPEN MAP</Text><Text numberOfLines={2} style={[styles.meta, { color: colors.foreground, marginTop: 2 }]}>{item.address}</Text></View><Feather name="arrow-up-right" size={15} color={colors.cyan} /></Pressable>
      {item.status === 'pending' ? <Text style={[styles.reviewCopy, { color: colors.mutedForeground }]}>Waiting for admin review. Not visible to players yet.</Text> : null}
      {item.status === 'rejected' ? <Text style={[styles.reviewCopy, { color: colors.destructive }]}>{item.reviewNote || 'Not approved. Contact the KICKOFF team if you need help.'}</Text> : null}
      {item.status === 'approved' && item.matchId ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/match-registration', params: { id: item.matchId! } })} style={[styles.openMatch, { borderColor: colors.border }]}><Text style={[styles.openMatchText, { color: colors.primary }]}>Open published match</Text><Feather name="arrow-up-right" size={14} color={colors.primary} /></Pressable> : null}
    </View>) : <Text style={[styles.meta, { color: colors.mutedForeground }]}>Submitted match times will appear here with their review status.</Text>}
  </Screen>;
}

function QuickStat({ label, value, tone, colors }: { label: string; value: string; tone: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.quickStat}><Text style={[styles.statValue, { color: tone }]}>{value}</Text><Text numberOfLines={1} style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

function OwnerToggle({ label, value, onPress, colors }: { label: string; value: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={[styles.toggleRow, { borderColor: colors.border }]}><Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text><View style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.secondary }]}><View style={[styles.toggleDot, { backgroundColor: value ? colors.primaryForeground : colors.mutedForeground, alignSelf: value ? 'flex-end' : 'flex-start' }]} /></View></Pressable>;
}

function RiyadhDateTimeFields({ value, onChange, colors }: { value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  const selected = parseRiyadhLocalInput(value) ?? new Date();
  const dateValue = value.slice(0, 10);
  const timeValue = value.slice(11, 16);
  const update = (mode: 'date' | 'time', next: Date) => {
    const [nextDate, nextTime] = toRiyadhLocalInput(next).split('T');
    onChange(mode === 'date' ? `${nextDate}T${timeValue}` : `${dateValue}T${nextTime}`);
  };
  const openPicker = (mode: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value: selected,
      mode,
      timeZoneName: 'Asia/Riyadh',
      minuteInterval: 1,
      is24Hour: true,
      ...(mode === 'date' ? { minimumDate: new Date() } : {}),
      onValueChange: (_event, next) => update(mode, next),
    });
  };
  if (Platform.OS === 'web') {
    const inputStyle = { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: 12, borderWidth: 1, padding: 10, fontSize: 14, minHeight: 46, width: '100%' };
    return <View style={styles.dateFields}>
      <View style={{ flex: 1 }}><Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>DATE · RIYADH</Text>{React.createElement('input', { type: 'date', value: dateValue, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(`${event.target.value}T${timeValue}`), 'aria-label': 'Match date in Riyadh', style: inputStyle })}</View>
      <View style={{ flex: 1 }}><Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>TIME · RIYADH</Text>{React.createElement('input', { type: 'time', value: timeValue, step: 60, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(`${dateValue}T${event.target.value}`), 'aria-label': 'Match time in Riyadh', style: inputStyle })}</View>
    </View>;
  }
  if (Platform.OS === 'ios') {
    return <View style={styles.dateFields}>
      <View style={{ flex: 1 }}><Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>DATE · RIYADH</Text><DateTimePicker value={selected} mode="date" display="compact" timeZoneName="Asia/Riyadh" minuteInterval={1} minimumDate={new Date()} onValueChange={(_event, next) => update('date', next)} /></View>
      <View style={{ flex: 1 }}><Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>TIME · RIYADH</Text><DateTimePicker value={selected} mode="time" display="compact" timeZoneName="Asia/Riyadh" minuteInterval={1} onValueChange={(_event, next) => update('time', next)} /></View>
    </View>;
  }
  return <View style={styles.dateFields}>
    {(['date', 'time'] as const).map((mode) => <View key={mode} style={{ flex: 1 }}><Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{mode.toUpperCase()} · RIYADH</Text><Pressable accessibilityRole="button" onPress={() => openPicker(mode)} style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.dateButtonText, { color: colors.foreground }]}>{mode === 'date' ? dateValue : timeValue}</Text><Feather name={mode === 'date' ? 'calendar' : 'clock'} size={15} color={colors.primary} /></Pressable></View>)}
  </View>;
}

const styles = StyleSheet.create({
  hero: { borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 0, paddingTop: 8, paddingBottom: 14, marginTop: 0, overflow: 'hidden' },
  scanButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 15 },
  quickStats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 12, marginBottom: 2 },
  quickStat: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 12 },
  statValue: { fontSize: 22, fontWeight: '800' }, statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  addressHint: { fontSize: 12, lineHeight: 17, marginTop: -7, marginBottom: 10 }, addressLink: { minHeight: 56, borderRadius: 12, backgroundColor: 'rgba(53,216,255,0.07)', padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 }, addressCaption: { fontSize: 10, letterSpacing: .4, fontWeight: '800' },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '800' },
  meta: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  reviewNotice: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, marginBottom: 14 },
  noticeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1, fontSize: 13, lineHeight: 19 },
  formCard: { borderWidth: 1, borderRadius: 17, padding: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  fixedDuration: { fontSize: 11, fontWeight: '700', marginTop: -4, marginBottom: 10 },
  dateFields: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  dateLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  dateButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateButtonText: { fontSize: 13, fontWeight: '600' },
  formGroupTitle: { fontSize: 12, letterSpacing: .5, fontWeight: '800', marginTop: 6, marginBottom: 12 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 10 },
  photoWrap: { width: 76, height: 70 },
  photo: { width: 76, height: 70, borderRadius: 10 },
  photoRemove: { position: 'absolute', top: 2, right: 2, width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { minWidth: 90, minHeight: 70, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  error: { fontSize: 13, lineHeight: 18, marginVertical: 9 },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  toggleRow: { minHeight: 48, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 12, fontWeight: '600' },
  toggle: { width: 42, height: 24, borderRadius: 15, padding: 4, justifyContent: 'center' },
  toggleDot: { width: 16, height: 16, borderRadius: 8 },
  submissionCard: { borderWidth: 1, borderRadius: 15, padding: 13, marginBottom: 10 },
  submissionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submissionDate: { fontSize: 13, fontWeight: '800' },
  statusPill: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, justifyContent: 'center' },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: .4 },
  reviewCopy: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  openMatch: { minHeight: 42, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  openMatchText: { fontSize: 13, fontWeight: '800' },
});
