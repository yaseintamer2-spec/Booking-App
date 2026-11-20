import React, { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { getGetCurrentUserQueryKey, getListAdminMatchesQueryKey, getListMatchesQueryKey, useCreateAdminMatch, useDeleteAdminMatch, useGetCurrentUser, useListAdminMatches, useUpdateAdminMatch } from '@workspace/api-client-react';
import type { Match } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandHeader, Button, EmptyState, Field, LoadingState, Screen, formatRiyadhDateTime, formatSar, parseRiyadhLocalInput, toRiyadhLocalInput } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FormState = {
  venueName: string; neighborhood: string; address: string; startsAt: string;
  durationMinutes: string; capacity: string; price: string; compareAt: string;
  status: 'draft' | 'published' | 'cancelled'; refereeIncluded: boolean; waterIncluded: boolean; imageUrl: string;
};
const freshForm = (): FormState => ({ venueName: '', neighborhood: '', address: '', startsAt: toRiyadhLocalInput(new Date(Date.now() + 86400000)), durationMinutes: '120', capacity: '14', price: '30', compareAt: '35', status: 'draft', refereeIncluded: true, waterIncluded: true, imageUrl: '' });
function fromMatch(match: Match): FormState {
  return { venueName: match.venueName, neighborhood: match.neighborhood, address: match.address, startsAt: toRiyadhLocalInput(match.startsAt), durationMinutes: String(match.durationMinutes), capacity: String(match.capacity), price: String(match.priceHalalas / 100), compareAt: String(match.compareAtPriceHalalas / 100), status: match.status, refereeIncluded: match.refereeIncluded, waterIncluded: match.waterIncluded, imageUrl: match.imageUrl || '' };
}

export default function AdminScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const qc = useQueryClient(); const router = useRouter();
  const me = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const isAdmin = !!me.data?.isAdmin;
  const list = useListAdminMatches({ query: { queryKey: getListAdminMatchesQueryKey(), enabled: isAdmin } });
  const create = useCreateAdminMatch(); const update = useUpdateAdminMatch(); const remove = useDeleteAdminMatch();
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Match | null>(null); const [form, setForm] = useState<FormState>(freshForm); const [formError, setFormError] = useState('');
  const busy = create.isPending || update.isPending;
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: getListAdminMatchesQueryKey() }), qc.invalidateQueries({ queryKey: getListMatchesQueryKey() })]); };
  const openCreate = () => { setEditing(null); setForm(freshForm()); setFormError(''); setFormOpen(true); };
  const openEdit = (match: Match) => { setEditing(match); setForm(fromMatch(match)); setFormError(''); setFormOpen(true); };
  const save = async () => {
    setFormError('');
    const startsAt = parseRiyadhLocalInput(form.startsAt);
    if (!form.venueName.trim() || !form.neighborhood.trim() || form.address.trim().length < 5 || !startsAt) { setFormError('Add a venue, Riyadh neighborhood, full address, and date/time in YYYY-MM-DDTHH:mm format.'); return; }
    const payload = { venueName: form.venueName.trim(), neighborhood: form.neighborhood.trim(), address: form.address.trim(), startsAt: startsAt.toISOString(), durationMinutes: Number(form.durationMinutes), capacity: Number(form.capacity), priceHalalas: Math.round(Number(form.price) * 100), compareAtPriceHalalas: Math.round(Number(form.compareAt) * 100), status: form.status, refereeIncluded: form.refereeIncluded, waterIncluded: form.waterIncluded, imageUrl: form.imageUrl.trim() };
    if (!Number.isInteger(payload.durationMinutes) || payload.durationMinutes < 30 || payload.durationMinutes > 240 || !Number.isInteger(payload.capacity) || payload.capacity < 2 || payload.capacity > 30 || !Number.isFinite(payload.priceHalalas) || payload.priceHalalas < 0 || !Number.isFinite(payload.compareAtPriceHalalas) || payload.compareAtPriceHalalas <= payload.priceHalalas) { setFormError('Use 30–240 minutes, 2–30 players, and a compare-at price above the SAR player price.'); return; }
    if (startsAt.getTime() <= Date.now()) { setFormError('Match start time must be in the future.'); return; }
    try { if (editing) await update.mutateAsync({ id: editing.id, data: payload }); else await create.mutateAsync({ data: payload }); await refresh(); setFormOpen(false); }
    catch { setFormError('Could not save this match. Check the fields and try again.'); }
  };
  const deleteMatch = (match: Match) => Alert.alert('Remove this match?', `${match.venueName} will be removed from KICKOFF.`, [{ text: 'Keep match', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { try { await remove.mutateAsync({ id: match.id }); await refresh(); } catch { Alert.alert('Could not remove match', 'Try again shortly.'); } } }]);
  const change = (key: keyof FormState, value: string | boolean) => setForm(old => ({ ...old, [key]: value }));
  if (me.isLoading) return <Screen><BrandHeader back user={me.data} subtitle="KICKOFF OPERATIONS" /><LoadingState /></Screen>;
  if (me.data && !isAdmin) return <Screen><BrandHeader back user={me.data} /><EmptyState icon="shield" title="Admin access only." body="Your account is not allowlisted for the KICKOFF admin console." /></Screen>;
  if (me.error || !me.data) return <Screen><BrandHeader back subtitle="KICKOFF OPERATIONS" /><EmptyState icon="alert-circle" title="Admin data unavailable." body="Sign in with an administrator account to use the match console." /></Screen>;
  return <>
    <Screen><BrandHeader back user={me.data} subtitle="KICKOFF OPERATIONS" />
      <View style={styles.headingRow}><View><Text style={[styles.kicker, { color: colors.primary }]}>RIYADH / MATCH MANAGEMENT</Text><Text style={[styles.title, { color: colors.foreground }]}>Admin console.</Text></View><Pressable onPress={openCreate} style={[styles.addButton, { backgroundColor: colors.primary }]} testID="create-match"><Feather name="plus" size={19} color={colors.primaryForeground} /></Pressable></View>
      <View style={[styles.adminNote, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="shield" size={15} color={colors.primary} /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Match changes are checked by the API. Admin access in this interface is only for navigation.</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in' as Href)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, marginBottom: 15 }}><Feather name="camera" size={16} color={colors.primaryForeground} /><Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: '800' }}>Staff check-in scanner</Text></Pressable>
       {list.isLoading ? <LoadingState /> : list.isError ? <EmptyState icon="alert-circle" title="Admin data unavailable." body="Check your connection and admin permissions, then return to the console." action="Retry" onAction={() => list.refetch()} /> : list.data?.length ? list.data.map(match => <View key={match.id} style={[styles.adminCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.cardHeader}><View style={{ flex: 1 }}><Text style={[styles.venue, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{match.neighborhood} · {formatRiyadhDateTime(match.startsAt)} Riyadh</Text></View><View style={[styles.status, { backgroundColor: match.status === 'published' ? colors.accent : colors.secondary }]}><Text style={[styles.statusText, { color: match.status === 'published' ? colors.primary : colors.mutedForeground }]}>{match.status.toUpperCase()}</Text></View></View><View style={styles.cardFooter}><Text style={[styles.meta, { color: colors.mutedForeground }]}>{match.bookedCount}/{match.capacity} booked · {formatSar(match.priceHalalas)}</Text><View style={{ flexDirection: 'row', gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${match.venueName}`} onPress={() => openEdit(match)} style={[styles.iconAction, { borderColor: colors.border }]}><Feather name="edit-2" size={15} color={colors.foreground} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${match.venueName}`} onPress={() => deleteMatch(match)} style={[styles.iconAction, { borderColor: colors.border }]}><Feather name="trash-2" size={15} color={colors.destructive} /></Pressable></View></View></View>) : <EmptyState icon="calendar" title="No matches in the console." body="Create the first match when the next Riyadh pitch is ready." />}
    </Screen>
    <Modal visible={formOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setFormOpen(false)}>
      <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) }]}><View style={[styles.modalHeader, { borderColor: colors.border }]}><Pressable onPress={() => setFormOpen(false)} style={styles.modalClose}><Feather name="x" size={21} color={colors.foreground} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.modalTitle, { color: colors.foreground }]}>{editing ? 'Edit match' : 'Create match'}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>7v7 · Riyadh · 14-player default</Text></View></View>
        <KeyboardAwareScrollViewCompat bottomOffset={80} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 30 }}>
          <Text style={[styles.formGroupTitle, { color: colors.primary }]}>PITCH DETAILS</Text>
          <Field label="VENUE NAME" value={form.venueName} onChangeText={v => change('venueName', v)} placeholder="Venue name" />
          <Field label="RIYADH NEIGHBORHOOD" value={form.neighborhood} onChangeText={v => change('neighborhood', v)} placeholder="e.g. Al Malqa" />
          <Field label="FULL ADDRESS" value={form.address} onChangeText={v => change('address', v)} placeholder="Street and location details" multiline />
           <Field label="DATE AND TIME · RIYADH" value={form.startsAt} onChangeText={v => change('startsAt', v)} placeholder="YYYY-MM-DDTHH:mm" />
          <Text style={[styles.formGroupTitle, { color: colors.primary }]}>MATCH SETUP</Text>
          <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="DURATION (MIN)" value={form.durationMinutes} onChangeText={v => change('durationMinutes', v)} placeholder="120" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="CAPACITY" value={form.capacity} onChangeText={v => change('capacity', v)} placeholder="14" keyboardType="numeric" /></View></View>
          <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="PLAYER PRICE (SAR)" value={form.price} onChangeText={v => change('price', v)} placeholder="30" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="COMPARE AT (SAR)" value={form.compareAt} onChangeText={v => change('compareAt', v)} placeholder="35" keyboardType="numeric" /></View></View>
          <Field label="IMAGE URL (OPTIONAL)" value={form.imageUrl} onChangeText={v => change('imageUrl', v)} placeholder="Leave blank for KICKOFF imagery" />
          <Text style={[styles.formGroupTitle, { color: colors.primary }]}>STATUS AND INCLUSIONS</Text>
          <View style={styles.statusChoices}>{(['draft', 'published', 'cancelled'] as const).map(status => <Pressable key={status} onPress={() => change('status', status)} style={[styles.statusChoice, { borderColor: form.status === status ? colors.primary : colors.border, backgroundColor: form.status === status ? colors.accent : colors.card }]}><Text style={{ color: form.status === status ? colors.primary : colors.mutedForeground, fontSize: 10, fontWeight: '700' }}>{status.toUpperCase()}</Text></Pressable>)}</View>
          <ToggleRow label="Referee included" value={form.refereeIncluded} onPress={() => change('refereeIncluded', !form.refereeIncluded)} />
          <ToggleRow label="Water provided" value={form.waterIncluded} onPress={() => change('waterIncluded', !form.waterIncluded)} />
          {formError ? <Text style={[styles.error, { color: colors.destructive }]}>{formError}</Text> : null}
          <Button label={busy ? 'Saving match…' : editing ? 'Save changes' : 'Create match'} onPress={save} disabled={busy} icon="check" />
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  </>;
}

function ToggleRow({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.toggleRow, { borderColor: colors.border }]}><Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text><View style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.secondary }]}><View style={[styles.toggleDot, { backgroundColor: value ? colors.primaryForeground : colors.mutedForeground, alignSelf: value ? 'flex-end' : 'flex-start' }]} /></View></Pressable>;
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 16 },
  kicker: { fontSize: 9, letterSpacing: 1.3, fontWeight: '800' },
  title: { fontSize: 29, fontFamily: 'Georgia', marginTop: 7 },
  addButton: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  adminNote: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9, marginBottom: 15 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15 },
  adminCard: { borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  venue: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 10, marginTop: 5, lineHeight: 15 },
  status: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 8, letterSpacing: 0.6, fontWeight: '800' },
  cardFooter: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 12, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconAction: { height: 34, width: 36, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1 },
  modalHeader: { minHeight: 68, paddingHorizontal: 18, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalClose: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  formGroupTitle: { fontSize: 9, letterSpacing: 1.6, fontWeight: '800', marginBottom: 13, marginTop: 8 },
  inlineFields: { flexDirection: 'row', gap: 12 },
  statusChoices: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  statusChoice: { borderWidth: 1, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12 },
  toggleRow: { minHeight: 48, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 12, fontWeight: '600' },
  toggle: { width: 42, height: 24, borderRadius: 15, padding: 4, justifyContent: 'center' },
  toggleDot: { width: 16, height: 16, borderRadius: 8 },
  error: { fontSize: 12, lineHeight: 18, marginVertical: 12 },
});

