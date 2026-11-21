import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { BrandHeader, Button, EmptyState, Field, LoadingState, Screen, formatRiyadhDateTime, formatSar, parseRiyadhLocalInput, toRiyadhLocalInput } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { uploadMatchImages } from '@/lib/matchImageUpload';

type Pitch = { email: string; venueName: string; neighborhood: string; address: string };
type Submission = { id: string; venueName: string; neighborhood: string; address: string; contactPhone: string; startsAt: string; durationMinutes: number; capacity: number; priceHalalas: number; compareAtPriceHalalas: number; refereeIncluded: boolean; waterIncluded: boolean; imageUrls: string[]; status: 'pending' | 'approved' | 'rejected'; reviewNote: string | null; matchId: string | null };
type Form = { startsAt: string; durationMinutes: string; capacity: string; price: string; compareAt: string; contactPhone: string; refereeIncluded: boolean; waterIncluded: boolean; imageUrls: string[] };
const freshForm = (): Form => ({ startsAt: toRiyadhLocalInput(new Date(Date.now() + 2 * 86400000)), durationMinutes: '120', capacity: '14', price: '30', compareAt: '35', contactPhone: '', refereeIncluded: true, waterIncluded: true, imageUrls: [] });

export default function PitchOwnerScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth();
  const [pitch, setPitch] = useState<Pitch | null>(null); const [submissions, setSubmissions] = useState<Submission[]>([]); const [form, setForm] = useState<Form>(freshForm); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
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
  const change = (key: keyof Form, value: string | boolean | string[]) => setForm((old) => ({ ...old, [key]: value }));
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
    const durationMinutes = Number(form.durationMinutes); const capacity = Number(form.capacity);
    const priceHalalas = Math.round(Number(form.price) * 100); const compareAtPriceHalalas = Math.round(Number(form.compareAt) * 100);
    if (!startsAt || startsAt.getTime() <= Date.now()) { setError('Choose a future date and time in Riyadh time.'); return; }
    if (!/^\+?[0-9][0-9 ()-]{7,18}$/.test(form.contactPhone.trim())) { setError('Enter a contact phone number so the team can reach you.'); return; }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 240 || !Number.isInteger(capacity) || capacity < 2 || capacity > 30 || !Number.isFinite(priceHalalas) || priceHalalas < 0 || !Number.isFinite(compareAtPriceHalalas) || compareAtPriceHalalas < priceHalalas) { setError('Check the duration, capacity, and player prices.'); return; }
    setBusy(true);
    try {
      const imageUrls = await uploadMatchImages(form.imageUrls, getToken);
      await request('/pitch-owner/submissions', { method: 'POST', body: JSON.stringify({ startsAt: startsAt.toISOString(), durationMinutes, capacity, priceHalalas, compareAtPriceHalalas, contactPhone: form.contactPhone.trim(), refereeIncluded: form.refereeIncluded, waterIncluded: form.waterIncluded, imageUrls }) });
      setForm(freshForm()); await load();
      Alert.alert('Request sent', 'Your match time is now waiting for admin review. It will appear in Discover only after approval.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit the match request.'); }
    finally { setBusy(false); }
  };
  if (loading) return <Screen><BrandHeader back subtitle="PITCH OWNER DESK" /><LoadingState /></Screen>;
  if (!pitch) return <Screen><BrandHeader back subtitle="PITCH OWNER DESK" /><EmptyState icon="lock" title="Pitch owner access needed." body={error || 'Ask KICKOFF to assign your account to a pitch.'} /></Screen>;
  return <Screen refreshing={false} onRefresh={() => { void load(); }}>
    <BrandHeader back subtitle="PITCH OWNER DESK" />
    <Text style={[styles.kicker, { color: colors.primary }]}>YOUR PITCH</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>{pitch.venueName}</Text>
    <Text style={[styles.meta, { color: colors.mutedForeground }]}>{pitch.neighborhood} · {pitch.address}</Text>
    <View style={[styles.reviewNotice, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.noticeIcon, { backgroundColor: colors.secondary }]}><Feather name="clock" size={16} color={colors.primary} /></View><Text style={[styles.noticeCopy, { color: colors.mutedForeground }]}>Choose a match time for this pitch and send us your contact number. Your request stays private until an admin reviews it.</Text></View>
    <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Propose a match</Text>
      <Field label="MATCH DATE AND TIME · RIYADH" value={form.startsAt} onChangeText={(value) => change('startsAt', value)} placeholder="YYYY-MM-DDTHH:mm" />
      <Field label="CONTACT PHONE" value={form.contactPhone} onChangeText={(value) => change('contactPhone', value)} placeholder="+966 5X XXX XXXX" keyboardType="phone-pad" autoComplete="off" />
      <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="DURATION · MIN" value={form.durationMinutes} onChangeText={(value) => change('durationMinutes', value)} placeholder="120" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="PLAYERS" value={form.capacity} onChangeText={(value) => change('capacity', value)} placeholder="14" keyboardType="numeric" /></View></View>
      <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="PLAYER PRICE · SAR" value={form.price} onChangeText={(value) => change('price', value)} placeholder="30" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="COMPARE AT · SAR" value={form.compareAt} onChangeText={(value) => change('compareAt', value)} placeholder="35" keyboardType="numeric" /></View></View>
      <Text style={[styles.formGroupTitle, { color: colors.primary }]}>PITCH PHOTOS · {form.imageUrls.length}/3</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: -8, marginBottom: 10 }]}>These use the same rotating photo gallery as other match cards.</Text>
      <View style={styles.photoRow}>{form.imageUrls.map((uri, index) => <View key={`${index}-${uri.slice(0, 24)}`} style={styles.photoWrap}><Image source={{ uri }} style={styles.photo} /><Pressable accessibilityRole="button" accessibilityLabel={`Remove pitch photo ${index + 1}`} onPress={() => change('imageUrls', form.imageUrls.filter((_, item) => item !== index))} style={[styles.photoRemove, { backgroundColor: colors.background }]}><Feather name="x" size={14} color={colors.foreground} /></Pressable></View>)}{form.imageUrls.length < 3 ? <Pressable accessibilityRole="button" onPress={() => void addPhotos()} style={[styles.addPhoto, { borderColor: colors.border }]}><Feather name="image" size={18} color={colors.primary} /><Text style={[styles.meta, { color: colors.foreground, marginTop: 0 }]}>Add photos</Text></Pressable> : null}</View>
      <OwnerToggle label="Referee included" value={form.refereeIncluded} onPress={() => change('refereeIncluded', !form.refereeIncluded)} colors={colors} />
      <OwnerToggle label="Water included" value={form.waterIncluded} onPress={() => change('waterIncluded', !form.waterIncluded)} colors={colors} />
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <Button label={busy ? 'Sending for review…' : 'Submit match for approval'} onPress={() => void submit()} disabled={busy} icon="send" />
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>Approval publishes the match in Discover with the same match card and registration screen as other games.</Text>
    </View>
    <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 22 }]}>Your match requests</Text>
    {submissions.length ? submissions.map((item) => <View key={item.id} style={[styles.submissionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.submissionTop}><View style={{ flex: 1 }}><Text style={[styles.submissionDate, { color: colors.foreground }]}>{formatRiyadhDateTime(item.startsAt)}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.durationMinutes} min · {item.capacity} players · {formatSar(item.priceHalalas)} each</Text></View><View style={[styles.statusPill, { backgroundColor: item.status === 'approved' ? colors.accent : colors.secondary }]}><Text style={[styles.statusText, { color: item.status === 'approved' ? colors.primary : colors.mutedForeground }]}>{item.status.toUpperCase()}</Text></View></View>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>Contact: {item.contactPhone}</Text>
      {item.status === 'pending' ? <Text style={[styles.reviewCopy, { color: colors.mutedForeground }]}>Waiting for admin review. Not visible to players yet.</Text> : null}
      {item.status === 'rejected' ? <Text style={[styles.reviewCopy, { color: colors.destructive }]}>{item.reviewNote || 'Not approved. Contact the KICKOFF team if you need help.'}</Text> : null}
      {item.status === 'approved' && item.matchId ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/match-registration', params: { id: item.matchId! } })} style={[styles.openMatch, { borderColor: colors.border }]}><Text style={[styles.openMatchText, { color: colors.primary }]}>Open published match</Text><Feather name="arrow-up-right" size={14} color={colors.primary} /></Pressable> : null}
    </View>) : <Text style={[styles.meta, { color: colors.mutedForeground }]}>Submitted match times will appear here with their review status.</Text>}
  </Screen>;
}

function OwnerToggle({ label, value, onPress, colors }: { label: string; value: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={[styles.toggleRow, { borderColor: colors.border }]}><Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text><View style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.secondary }]}><View style={[styles.toggleDot, { backgroundColor: value ? colors.primaryForeground : colors.mutedForeground, alignSelf: value ? 'flex-end' : 'flex-start' }]} /></View></Pressable>;
}

const styles = StyleSheet.create({
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 18 },
  title: { fontFamily: 'Georgia', fontSize: 30, marginTop: 6 },
  meta: { fontSize: 11, lineHeight: 17, marginTop: 5 },
  reviewNotice: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, marginBottom: 14 },
  noticeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1, fontSize: 11, lineHeight: 17 },
  formCard: { borderWidth: 1, borderRadius: 17, padding: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  formGroupTitle: { fontSize: 9, letterSpacing: 1.3, fontWeight: '800', marginTop: 6, marginBottom: 12 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 10 },
  photoWrap: { width: 76, height: 70 },
  photo: { width: 76, height: 70, borderRadius: 10 },
  photoRemove: { position: 'absolute', top: 2, right: 2, width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { minWidth: 90, minHeight: 70, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  error: { fontSize: 11, lineHeight: 17, marginVertical: 9 },
  footnote: { fontSize: 10, lineHeight: 15, marginTop: 10, textAlign: 'center' },
  toggleRow: { minHeight: 48, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 12, fontWeight: '600' },
  toggle: { width: 42, height: 24, borderRadius: 15, padding: 4, justifyContent: 'center' },
  toggleDot: { width: 16, height: 16, borderRadius: 8 },
  submissionCard: { borderWidth: 1, borderRadius: 15, padding: 13, marginBottom: 10 },
  submissionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submissionDate: { fontSize: 13, fontWeight: '800' },
  statusPill: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, justifyContent: 'center' },
  statusText: { fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  reviewCopy: { fontSize: 10, lineHeight: 15, marginTop: 8 },
  openMatch: { minHeight: 42, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  openMatchText: { fontSize: 11, fontWeight: '800' },
});
