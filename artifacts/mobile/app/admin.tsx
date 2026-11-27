import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useAuth, useUser } from '@clerk/expo';
import { getGetCurrentUserQueryKey, getListAdminMatchesQueryKey, getListMatchesQueryKey, useCreateAdminMatch, useDeleteAdminMatch, useGetCurrentUser, useListAdminMatches, useUpdateAdminMatch } from '@workspace/api-client-react';
import type { Match } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandHeader, Button, EmptyState, Field, LoadingState, Screen, formatRiyadhDateTime, formatSar, parseRiyadhLocalInput, toRiyadhLocalInput } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiBaseUrl, explainApiConnectionError } from '@/lib/apiBaseUrl';
import { uploadMatchImages } from '@/lib/matchImageUpload';
import { MatchAgeGroupPicker } from '@/components/MatchAgeGroupPicker';
import type { MatchAgeGroup } from '@/lib/matchAge';
import { hasVerifiedOwnerEmail, OWNER_EMAIL } from '@/lib/roles';

type Referee = { id: string; name: string; avatarUrl: string | null };
type AdminGrant = { email: string; createdAt: string };

function confirmAdminAction(title: string, message: string, confirmLabel: string, destructive: boolean, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

type FormState = {
  venueName: string; neighborhood: string; address: string; startsAt: string;
  durationMinutes: string; capacity: string; price: string; compareAt: string;
  ageGroup: MatchAgeGroup;
  status: 'draft' | 'published' | 'cancelled'; refereeUserId: string; waterIncluded: boolean; imageUrl: string; imageUrls: string[];
};
const freshForm = (): FormState => ({ venueName: '', neighborhood: '', address: '', startsAt: toRiyadhLocalInput(new Date(Date.now() + 86400000)), durationMinutes: '120', capacity: '14', price: '30', compareAt: '35', ageGroup: '13-16', status: 'draft', refereeUserId: '', waterIncluded: true, imageUrl: '', imageUrls: [] });
function fromMatch(match: Match): FormState {
  const imageUrls = match.imageUrls?.length ? match.imageUrls : /^https:\/\//i.test(match.imageUrl) ? [match.imageUrl] : [];
  return { venueName: match.venueName, neighborhood: match.neighborhood, address: match.address, startsAt: toRiyadhLocalInput(match.startsAt), durationMinutes: String(match.durationMinutes), capacity: String(match.capacity), ageGroup: match.ageGroup, price: String(match.priceHalalas / 100), compareAt: String(match.compareAtPriceHalalas / 100), status: match.status, refereeUserId: match.refereeUserId || '', waterIncluded: match.waterIncluded, imageUrl: imageUrls[0] || '', imageUrls };
}

export default function AdminScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const qc = useQueryClient(); const router = useRouter(); const { getToken } = useAuth(); const { user } = useUser();
  const me = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const ownerFromVerifiedEmail = hasVerifiedOwnerEmail(user?.emailAddresses);
  const isAdmin = !!me.data?.isAdmin || ownerFromVerifiedEmail;
  const isOwner = !!me.data?.isOwner || ownerFromVerifiedEmail;
  const list = useListAdminMatches({ query: { queryKey: getListAdminMatchesQueryKey(), enabled: isAdmin } });
  const create = useCreateAdminMatch(); const update = useUpdateAdminMatch(); const remove = useDeleteAdminMatch();
  const [referees, setReferees] = useState<Referee[]>([]);
  const [refereeLoadError, setRefereeLoadError] = useState('');
  const [adminGrants, setAdminGrants] = useState<AdminGrant[]>([]);
  const [ownerEmail, setOwnerEmail] = useState(OWNER_EMAIL);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminAccessBusy, setAdminAccessBusy] = useState(false);
  const [adminAccessError, setAdminAccessError] = useState('');
  const [imageMigrationBusy, setImageMigrationBusy] = useState(false);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [imageMigrationMessage, setImageMigrationMessage] = useState('');
  const loadReferees = useCallback(async () => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api/admin/referees`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(`Could not load approved referee accounts (HTTP ${response.status}). Check that the API server is deployed and reachable.`);
    setReferees(await response.json() as Referee[]);
    setRefereeLoadError('');
  }, [getToken]);
  const adminAccessRequest = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Could not update admin access.');
    return payload;
  }, [getToken]);
  const loadAdminGrants = useCallback(async () => {
    if (!isOwner) return;
    try {
      const result = await adminAccessRequest('/admin/admins') as { ownerEmail: string; administrators: AdminGrant[] };
      setOwnerEmail(result.ownerEmail);
      setAdminGrants(result.administrators);
      setAdminAccessError('');
    } catch (error) {
      setAdminAccessError(error instanceof Error ? error.message : 'Could not load administrators.');
    }
  }, [adminAccessRequest, isOwner]);
  useEffect(() => { void loadAdminGrants(); }, [loadAdminGrants]);
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void loadReferees().catch((cause) => { if (active) setRefereeLoadError(explainApiConnectionError(cause, 'Approved referees could not be loaded.')); });
    return () => { active = false; };
  }, [loadReferees, isAdmin]);
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Match | null>(null); const [form, setForm] = useState<FormState>(freshForm); const [formError, setFormError] = useState('');
  const busy = create.isPending || update.isPending || imageMigrationBusy || photoUploadBusy;
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: getListAdminMatchesQueryKey() }), qc.invalidateQueries({ queryKey: getListMatchesQueryKey() })]); };
  const openCreate = () => { setEditing(null); setForm(freshForm()); setFormError(''); setFormOpen(true); };
  const openEdit = (match: Match) => { setEditing(match); setForm(fromMatch(match)); setFormError(''); setFormOpen(true); };
  const save = async () => {
    setFormError('');
    const startsAt = parseRiyadhLocalInput(form.startsAt);
    if (!form.venueName.trim() || !form.neighborhood.trim() || form.address.trim().length < 5 || !startsAt) { setFormError('Add a venue, Riyadh neighborhood, full address, and date/time in YYYY-MM-DDTHH:mm format.'); return; }
    const payload = { venueName: form.venueName.trim(), neighborhood: form.neighborhood.trim(), address: form.address.trim(), startsAt: startsAt.toISOString(), durationMinutes: Number(form.durationMinutes), capacity: Number(form.capacity), ageGroup: form.ageGroup, priceHalalas: Math.round(Number(form.price) * 100), compareAtPriceHalalas: Math.round(Number(form.compareAt) * 100), status: form.status, refereeIncluded: true, refereeUserId: form.refereeUserId || null, waterIncluded: form.waterIncluded, imageUrl: 'match-card', imageUrls: form.imageUrls };
    if (!Number.isInteger(payload.durationMinutes) || payload.durationMinutes < 30 || payload.durationMinutes > 240 || !Number.isInteger(payload.capacity) || payload.capacity < 2 || payload.capacity > 30 || !Number.isFinite(payload.priceHalalas) || payload.priceHalalas < 0 || !Number.isFinite(payload.compareAtPriceHalalas) || payload.compareAtPriceHalalas < payload.priceHalalas) { setFormError('Use 30–240 minutes, 2–30 players, and a compare-at price at least as high as the SAR player price.'); return; }
    if (startsAt.getTime() <= Date.now()) { setFormError('Match start time must be in the future.'); return; }
    try {
      setPhotoUploadBusy(true);
      const imageUrls = await uploadMatchImages(form.imageUrls, getToken);
      const savedPayload = { ...payload, imageUrls, imageUrl: imageUrls.length ? 'match-card' : '' };
      if (editing) await update.mutateAsync({ id: editing.id, data: savedPayload }); else await create.mutateAsync({ data: savedPayload });
      await refresh(); setFormOpen(false);
    }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save this match. Check the fields and try again.'); }
    finally { setPhotoUploadBusy(false); }
  };
  const migrateExistingMatchImages = async () => {
    setImageMigrationBusy(true); setImageMigrationMessage('');
    try {
      const result = await adminAccessRequest('/admin/match-images/migrate', { method: 'POST' }) as { migratedPhotos: number };
      setImageMigrationMessage(`${result.migratedPhotos} existing photo${result.migratedPhotos === 1 ? '' : 's'} moved to file storage.`);
      await refresh();
    } catch (error) { setImageMigrationMessage(error instanceof Error ? error.message : 'Could not move existing photos.'); }
    finally { setImageMigrationBusy(false); }
  };
  const deleteMatch = (match: Match) => Alert.alert('Remove this match?', `${match.venueName} will be removed from KICKOFF.`, [{ text: 'Keep match', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { try { await remove.mutateAsync({ id: match.id }); await refresh(); } catch { Alert.alert('Could not remove match', 'Try again shortly.'); } } }]);
  const grantAdminAccess = () => {
    const email = adminEmail.trim().toLowerCase();
    if (!email) { setAdminAccessError('Enter the person’s verified sign-in email.'); return; }
    Alert.alert('Grant admin access?', `${email} will be able to manage matches and use the admin tools. You can revoke access here anytime.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Grant access', onPress: () => { void (async () => { setAdminAccessBusy(true); setAdminAccessError(''); try { await adminAccessRequest('/admin/admins', { method: 'POST', body: JSON.stringify({ email }) }); setAdminEmail(''); await loadAdminGrants(); } catch (error) { setAdminAccessError(error instanceof Error ? error.message : 'Could not grant admin access.'); } finally { setAdminAccessBusy(false); } })(); } },
    ]);
  };
  const revokeAdminAccess = (email: string) => Alert.alert('Revoke admin access?', `${email} will lose access to the admin console and match controls. You can grant access again later.`, [
    { text: 'Keep access', style: 'cancel' },
    { text: 'Revoke access', style: 'destructive', onPress: () => { void (async () => { setAdminAccessBusy(true); setAdminAccessError(''); try { await adminAccessRequest(`/admin/admins/${encodeURIComponent(email)}`, { method: 'DELETE' }); await loadAdminGrants(); } catch (error) { setAdminAccessError(error instanceof Error ? error.message : 'Could not revoke admin access.'); } finally { setAdminAccessBusy(false); } })(); } },
  ]);
  const change = (key: keyof FormState, value: string | boolean) => setForm(old => ({ ...old, [key]: value }));
  const addPhotos = async () => {
    const slots = 3 - form.imageUrls.length;
    if (slots <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: slots, quality: 0.4, base64: true });
    if (result.canceled) return;
    const added = result.assets.flatMap(asset => asset.base64 ? [`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`] : []);
    if (!added.length) { setFormError('Those photos could not be prepared. Choose another image format.'); return; }
    const imageUrls = [...form.imageUrls, ...added].slice(0, 3);
    if (imageUrls.reduce((total, uri) => total + uri.length, 0) > 4_200_000) { setFormError('Please choose smaller photos. Match galleries support up to 3 compressed photos.'); return; }
    setForm(old => ({ ...old, imageUrls, imageUrl: imageUrls[0] || '' }));
    setFormError('');
  };
  const removePhoto = (index: number) => setForm(old => { const imageUrls = old.imageUrls.filter((_, photoIndex) => photoIndex !== index); return { ...old, imageUrls, imageUrl: imageUrls[0] || '' }; });
  if (me.isLoading && !ownerFromVerifiedEmail) return <Screen><BrandHeader back user={me.data} subtitle="KICKOFF OPERATIONS" /><LoadingState /></Screen>;
  if (me.data && !isAdmin) return <Screen><BrandHeader back user={me.data} /><EmptyState icon="shield" title="Admin access only." body="Your account is not allowlisted for the KICKOFF admin console." /></Screen>;
  if ((me.error || !me.data) && !ownerFromVerifiedEmail) return <Screen><BrandHeader back subtitle="KICKOFF OPERATIONS" /><EmptyState icon="alert-circle" title="Admin data unavailable." body="Sign in with an administrator account to use the match console." /></Screen>;
  return <>
    <Screen><BrandHeader back user={me.data} subtitle="KICKOFF OPERATIONS" />
      <View style={styles.headingRow}><Text style={[styles.title, { color: colors.foreground }]}>Admin console</Text><Pressable accessibilityRole="button" accessibilityLabel="Create a match" onPress={openCreate} style={[styles.addButton, { backgroundColor: colors.primary }]} testID="create-match"><Feather name="plus" size={19} color={colors.primaryForeground} /></Pressable></View>
      <View style={[styles.adminNote, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="shield" size={15} color={colors.primary} /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Admin and owner permissions are checked when you save changes.</Text></View>
      {isOwner ? <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.accessHeading}><View style={{ flex: 1 }}><Text style={[styles.formGroupTitle, { color: colors.primary, marginTop: 0, marginBottom: 5 }]}>OWNER ACCESS</Text><Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 0 }]}>Only you can grant or revoke admin access.</Text></View><View style={[styles.ownerBadge, { backgroundColor: colors.accent }]}><Feather name="shield" size={12} color={colors.primary} /><Text style={[styles.ownerBadgeText, { color: colors.primary }]}>OWNER</Text></View></View>
        <Text style={[styles.accessEmail, { color: colors.foreground }]}>{ownerEmail}</Text>
        <View style={[styles.addAdminRow, { borderColor: colors.border }]}>
          <TextInput accessibilityLabel="Email address to make an admin" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" placeholder="Verified account email" placeholderTextColor={colors.mutedForeground} value={adminEmail} onChangeText={setAdminEmail} editable={!adminAccessBusy} style={[styles.adminEmailInput, { color: colors.foreground }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Grant admin access" disabled={adminAccessBusy || !adminEmail.trim()} onPress={grantAdminAccess} style={[styles.grantButton, { backgroundColor: colors.primary, opacity: adminAccessBusy || !adminEmail.trim() ? .55 : 1 }]}><Feather name="user-plus" size={15} color={colors.primaryForeground} /><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{adminAccessBusy ? 'Saving…' : 'Add admin'}</Text></Pressable>
        </View>
        {adminAccessError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{adminAccessError}</Text> : null}
        {adminGrants.map((grant) => (
          <View key={grant.email} style={[styles.adminGrantRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.grantEmail, { color: colors.foreground }]}>{grant.email}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 3 }]}>Admin access</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={'Revoke admin access for ' + grant.email} disabled={adminAccessBusy} onPress={() => revokeAdminAccess(grant.email)} style={[styles.revokeButton, { borderColor: colors.destructive, opacity: adminAccessBusy ? .5 : 1 }]}>
              <Text style={[styles.revokeText, { color: colors.destructive }]}>Revoke</Text>
            </Pressable>
          </View>
        ))}
        {!adminGrants.length ? <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 12 }]}>No additional admins yet.</Text> : null}
      </View> : null}
      <PitchSubmissionReview visible={isAdmin} />
      {isOwner ? <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.formGroupTitle, { color: colors.primary, marginTop: 0 }]}>PITCH PHOTO STORAGE</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 0 }]}>Move older photos from the database into the configured image bucket. New photos upload there automatically.</Text>
        {imageMigrationMessage ? <Text accessibilityRole="alert" style={[styles.meta, { color: imageMigrationMessage.includes('moved to file storage') ? colors.primary : colors.destructive }]}>{imageMigrationMessage}</Text> : null}
        <Pressable accessibilityRole="button" disabled={imageMigrationBusy} onPress={() => confirmAdminAction('Move existing pitch photos?', 'This uploads old pitch photos to the configured storage bucket and replaces their database copies with file addresses.', 'Move photos', false, () => void migrateExistingMatchImages())} style={[styles.grantButton, { backgroundColor: colors.primary, alignSelf: 'flex-start', opacity: imageMigrationBusy ? .55 : 1 }]}><Feather name="upload-cloud" size={15} color={colors.primaryForeground} /><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{imageMigrationBusy ? 'Moving photos…' : 'Move existing photos'}</Text></Pressable>
      </View> : null}
      <RefereeAssignmentReview visible={isAdmin} />
      <PitchOwnerManagement visible={isOwner} />
      <RefereeAccessManagement visible={isAdmin} onChanged={loadReferees} />
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
          <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>PLAYER AGE GROUP</Text><MatchAgeGroupPicker value={form.ageGroup} onChange={(ageGroup) => setForm((current) => ({ ...current, ageGroup }))} />
          <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="DURATION (MIN)" value={form.durationMinutes} onChangeText={v => change('durationMinutes', v)} placeholder="120" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="CAPACITY" value={form.capacity} onChangeText={v => change('capacity', v)} placeholder="14" keyboardType="numeric" /></View></View>
          <View style={styles.inlineFields}><View style={{ flex: 1 }}><Field label="PLAYER PRICE (SAR)" value={form.price} onChangeText={v => change('price', v)} placeholder="30" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="COMPARE AT (SAR)" value={form.compareAt} onChangeText={v => change('compareAt', v)} placeholder="35" keyboardType="numeric" /></View></View>
          <Text style={[styles.formGroupTitle, { color: colors.primary }]}>PITCH PHOTOS · {form.imageUrls.length}/3</Text>
          <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>Add up to three photos. They rotate on the match card and can also be swiped.</Text>
          <View style={styles.photoRow}>{form.imageUrls.map((uri, index) => <View key={`${index}-${uri.slice(0, 30)}`} style={styles.photoPreviewWrap}><Image source={{ uri }} style={styles.photoPreview} /><Pressable accessibilityRole="button" accessibilityLabel={`Remove pitch photo ${index + 1}`} onPress={() => removePhoto(index)} style={[styles.removePhoto, { backgroundColor: colors.background, borderColor: colors.border }]}><Feather name="x" size={15} color={colors.foreground} /></Pressable></View>)}{form.imageUrls.length < 3 ? <Pressable accessibilityRole="button" accessibilityLabel="Choose pitch photos" onPress={() => void addPhotos()} style={[styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="image" size={19} color={colors.primary} /><Text style={[styles.addPhotoText, { color: colors.foreground }]}>Add photos</Text></Pressable> : null}</View>
          <Text style={[styles.formGroupTitle, { color: colors.primary }]}>STATUS AND INCLUSIONS</Text>
          <View style={styles.statusChoices}>{(['draft', 'published', 'cancelled'] as const).map(status => <Pressable key={status} onPress={() => change('status', status)} style={[styles.statusChoice, { borderColor: form.status === status ? colors.primary : colors.border, backgroundColor: form.status === status ? colors.accent : colors.card }]}><Text style={{ color: form.status === status ? colors.primary : colors.mutedForeground, fontSize: 10, fontWeight: '700' }}>{status.toUpperCase()}</Text></Pressable>)}</View>
          <Text style={[styles.photoHint, { color: colors.mutedForeground, marginTop: 8 }]}>ASSIGN REFEREE</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: -7 }]}>Every match includes a referee. Assign one here or review referee applications below.</Text>
          {refereeLoadError ? <Text style={[styles.error, { color: colors.mutedForeground }]}>{refereeLoadError}</Text> : null}
          <View style={styles.refereeOptions}>
            {[{ id: '', name: 'Not assigned', avatarUrl: null }, ...referees].map(referee => {
              const selected = form.refereeUserId === referee.id;
              return <Pressable key={referee.id || 'unassigned'} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => change('refereeUserId', referee.id)} style={[styles.refereeOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.accent : colors.card }]}>
                {referee.avatarUrl ? <Image source={{ uri: referee.avatarUrl }} style={styles.refereeAvatar} /> : <View style={[styles.refereeAvatar, { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }]}><Feather name="user" size={13} color={colors.mutedForeground} /></View>}
                <Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700', flexShrink: 1 }}>{referee.name}</Text>
              </Pressable>;
            })}
          </View>
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

type PitchOwnerGrant = { email: string; venueName: string; neighborhood: string; address: string };
type RefereeGrant = { email: string; createdAt: string };
type PitchSubmission = { id: string; ownerEmail: string; venueName: string; neighborhood: string; address: string; contactPhone: string; startsAt: string; durationMinutes: number; capacity: number; rentalPriceHalalas: number | null; refereeIncluded: boolean; waterIncluded: boolean; imageUrls: string[] };

function PitchOwnerManagement({ visible }: { visible: boolean }) {
  const colors = useColors(); const { getToken } = useAuth();
  const [owners, setOwners] = useState<PitchOwnerGrant[]>([]); const [email, setEmail] = useState(''); const [venueName, setVenueName] = useState(''); const [neighborhood, setNeighborhood] = useState(''); const [address, setAddress] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    let body;
    try { body = response.status === 204 ? null : await response.json(); }
    catch { throw new Error('The match API returned an invalid response. Check that EXPO_PUBLIC_API_URL points to the KICKOFF API server, not the static app or Supabase URL.'); }
    if (!response.ok) throw new Error(body?.error || 'Could not update pitch-owner access.');
    return body;
  }, [getToken]);
  const load = useCallback(async () => { if (!visible) return; try { setOwners(await request('/admin/pitch-owners') as PitchOwnerGrant[]); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load pitch owners.'); } }, [request, visible]);
  useEffect(() => { void load(); }, [load]);
  const save = () => {
    if (!email.trim() || !venueName.trim() || !neighborhood.trim() || !address.trim()) { setError('Add the verified email and the pitch details.'); return; }
    confirmAdminAction('Grant pitch-owner access?', `${email.trim()} can submit match times for ${venueName.trim()}. Every match request still needs admin approval.`, 'Grant access', false, () => { void (async () => { setBusy(true); setError(''); try { await request('/admin/pitch-owners', { method: 'POST', body: JSON.stringify({ email, venueName, neighborhood, address }) }); setEmail(''); setVenueName(''); setNeighborhood(''); setAddress(''); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not grant pitch-owner access.'); } finally { setBusy(false); } })(); });
  };
  const revoke = (owner: PitchOwnerGrant) => confirmAdminAction('Remove pitch-owner access?', `${owner.email} will no longer be able to submit match requests for ${owner.venueName}.`, 'Remove access', true, () => { void (async () => { setBusy(true); try { await request(`/admin/pitch-owners/${encodeURIComponent(owner.email)}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove pitch-owner access.'); } finally { setBusy(false); } })(); });
  if (!visible) return null;
  return <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Text style={[styles.formGroupTitle, { color: colors.primary, marginTop: 0 }]}>PITCH OWNER ACCESS</Text>
    <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: -7, marginBottom: 12 }]}>Assign a verified account to one pitch. Their submitted dates remain private until an admin approves them.</Text>
    <TextInput accessibilityLabel="Pitch owner verified email" autoCapitalize="none" keyboardType="email-address" placeholder="Verified account email" placeholderTextColor={colors.mutedForeground} value={email} onChangeText={setEmail} style={[styles.ownerInput, { borderColor: colors.border, color: colors.foreground }]} />
    <TextInput accessibilityLabel="Pitch name" placeholder="Pitch name" placeholderTextColor={colors.mutedForeground} value={venueName} onChangeText={setVenueName} style={[styles.ownerInput, { borderColor: colors.border, color: colors.foreground }]} />
    <TextInput accessibilityLabel="Pitch area or neighborhood" placeholder="Area or neighborhood" placeholderTextColor={colors.mutedForeground} value={neighborhood} onChangeText={setNeighborhood} style={[styles.ownerInput, { borderColor: colors.border, color: colors.foreground }]} />
    <TextInput accessibilityLabel="Full pitch address" multiline placeholder="Full pitch address" placeholderTextColor={colors.mutedForeground} value={address} onChangeText={setAddress} style={[styles.ownerInput, styles.ownerAddressInput, { borderColor: colors.border, color: colors.foreground }]} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[styles.ownerGrantButton, { backgroundColor: colors.primary, opacity: busy ? .6 : 1 }]}><Feather name="user-plus" size={15} color={colors.primaryForeground} /><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Add pitch owner'}</Text></Pressable>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    {owners.map(owner => <View key={owner.email} style={[styles.adminGrantRow, { borderTopColor: colors.border }]}><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.grantEmail, { color: colors.foreground }]}>{owner.email}</Text><Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 3 }]}>{owner.venueName} · {owner.neighborhood}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Remove pitch-owner access for ${owner.email}`} disabled={busy} onPress={() => revoke(owner)} style={[styles.revokeButton, { borderColor: colors.destructive }]}><Text style={[styles.revokeText, { color: colors.destructive }]}>Remove</Text></Pressable></View>)}
  </View>;
}

function PitchSubmissionReview({ visible }: { visible: boolean }) {
  const colors = useColors(); const { getToken } = useAuth(); const qc = useQueryClient();
  const [submissions, setSubmissions] = useState<PitchSubmission[]>([]); const [ticketPrices, setTicketPrices] = useState<Record<string, string>>({}); const [busyId, setBusyId] = useState(''); const [error, setError] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    let body;
    try { body = response.status === 204 ? null : await response.json(); }
    catch { throw new Error('The match API returned an invalid response. Check that EXPO_PUBLIC_API_URL points to the KICKOFF API server, not the static app or Supabase URL.'); }
    if (!response.ok) throw new Error(body?.error || 'Could not review this match request.');
    return body;
  }, [getToken]);
  const load = useCallback(async () => { if (!visible) return; try { setSubmissions(await request('/admin/pitch-match-submissions') as PitchSubmission[]); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load pitch requests.'); } }, [request, visible]);
  useEffect(() => { void load(); }, [load]);
  const review = (submission: PitchSubmission, action: 'approve' | 'reject') => {
    const isApprove = action === 'approve';
    const enteredPrice = ticketPrices[submission.id]?.trim() ?? '';
    const playerPriceHalalas = Math.round(Number(enteredPrice) * 100);
    if (isApprove && (!/^\d+(?:\.\d{1,2})?$/.test(enteredPrice) || !Number.isSafeInteger(playerPriceHalalas) || playerPriceHalalas > 2_147_483_647)) { setError('Enter the player ticket price in SAR before approving this request.'); return; }
    const body = isApprove ? { action, playerPriceHalalas } : { action };
    const rentalPrice = submission.rentalPriceHalalas === null ? 'not recorded' : formatSar(submission.rentalPriceHalalas);
    confirmAdminAction(isApprove ? 'Approve and publish this match?' : 'Reject this match request?', isApprove ? `${submission.venueName} · ${formatRiyadhDateTime(submission.startsAt)} Riyadh · 2 hours. Pitch rental: ${rentalPrice}. Player ticket: ${formatSar(playerPriceHalalas)}. It will appear in Discover.` : `${submission.venueName} · ${formatRiyadhDateTime(submission.startsAt)} Riyadh. It will stay out of Discover.`, isApprove ? 'Approve & publish' : 'Reject request', !isApprove, () => { void (async () => { setBusyId(submission.id); setError(''); try { await request(`/admin/pitch-match-submissions/${submission.id}`, { method: 'PATCH', body: JSON.stringify(body) }); await load(); if (isApprove) await Promise.all([qc.invalidateQueries({ queryKey: getListAdminMatchesQueryKey() }), qc.invalidateQueries({ queryKey: getListMatchesQueryKey() })]); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not review this request.'); } finally { setBusyId(''); } })(); });
  };
  if (!visible) return null;
  return <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.accessHeading}><View style={{ flex: 1 }}><Text style={[styles.formGroupTitle, { color: colors.primary, marginTop: 0, marginBottom: 4 }]}>PITCH MATCH REQUESTS</Text><Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 0 }]}>Approve to publish in Discover. Requests stay private until approved.</Text></View><View style={[styles.requestCount, { backgroundColor: colors.accent }]}><Text style={[styles.ownerBadgeText, { color: colors.primary }]}>{submissions.length} PENDING</Text></View></View>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    {submissions.length ? submissions.map(submission => <View key={submission.id} style={[styles.requestCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.venue, { color: colors.foreground }]}>{submission.venueName}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{submission.neighborhood} · {formatRiyadhDateTime(submission.startsAt)} · 2 hours</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>Owner: {submission.ownerEmail} · Contact: {submission.contactPhone}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{submission.capacity} players · Pitch rental (private): {submission.rentalPriceHalalas === null ? 'not recorded' : formatSar(submission.rentalPriceHalalas)}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>Google Maps location: {submission.address}</Text>
      <View style={styles.requestPhotos}>{submission.imageUrls.slice(0, 3).map((uri, index) => <Image key={`${submission.id}-${index}`} source={{ uri }} style={[styles.requestPhoto, { borderColor: colors.border }]} accessibilityLabel={`Submitted pitch photo ${index + 1}`} />)}</View>
      <Text style={[styles.formGroupTitle, { color: colors.primary, marginBottom: 6 }]}>PLAYER TICKET PRICE · SAR</Text>
      <TextInput accessibilityLabel={`Player ticket price in SAR for ${submission.venueName}`} value={ticketPrices[submission.id] ?? ''} onChangeText={(value) => setTicketPrices((current) => ({ ...current, [submission.id]: value }))} placeholder="Enter price per player" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" editable={!busyId} style={[styles.ownerInput, { borderColor: colors.border, color: colors.foreground }]} />
      <View style={styles.reviewActions}>
        <Pressable accessibilityRole="button" disabled={!!busyId} onPress={() => review(submission, 'reject')} style={[styles.rejectButton, { borderColor: colors.destructive, opacity: busyId ? .5 : 1 }]}><Text style={[styles.revokeText, { color: colors.destructive }]}>{busyId === submission.id ? 'Saving…' : 'Reject'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!!busyId} onPress={() => review(submission, 'approve')} style={[styles.approveButton, { backgroundColor: colors.primary, opacity: busyId ? .5 : 1 }]}><Feather name="check" size={14} color={colors.primaryForeground} /><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{busyId === submission.id ? 'Saving…' : 'Approve & publish'}</Text></Pressable>
      </View>
    </View>) : <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 12 }]}>No match requests waiting for review.</Text>}
  </View>;
}

function RefereeAccessManagement({ visible, onChanged }: { visible: boolean; onChanged: () => Promise<void> }) {
  const colors = useColors(); const { getToken } = useAuth();
  const [grants, setGrants] = useState<RefereeGrant[]>([]); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    let body;
    try { body = response.status === 204 ? null : await response.json(); }
    catch { throw new Error('The match API returned an invalid response. Check that EXPO_PUBLIC_API_URL points to the KICKOFF API server, not the static app or Supabase URL.'); }
    if (!response.ok) throw new Error(body?.error || 'Could not update referee access.');
    return body;
  }, [getToken]);
  const load = useCallback(async () => { if (!visible) return; try { setGrants(await request('/admin/referee-access') as RefereeGrant[]); setError(''); } catch (cause) { setError(explainApiConnectionError(cause, 'Could not load referee access.')); } }, [request, visible]);
  useEffect(() => { void load(); }, [load]);
  const grant = () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setError('Enter the verified email used by this referee to sign in.'); return; }
    confirmAdminAction('Approve this referee?', `${cleanEmail} can be assigned to matches. They must accept each match invitation before using its controls.`, 'Approve referee', false, () => { void (async () => { setBusy(true); setError(''); try { await request('/admin/referee-access', { method: 'POST', body: JSON.stringify({ email: cleanEmail }) }); setEmail(''); await Promise.all([load(), onChanged()]); } catch (cause) { setError(explainApiConnectionError(cause, 'Could not approve referee.')); } finally { setBusy(false); } })(); });
  };
  const revoke = (grantItem: RefereeGrant) => confirmAdminAction('Remove referee access?', `${grantItem.email} can no longer accept assignments or control matches.`, 'Remove access', true, () => { void (async () => { setBusy(true); setError(''); try { await request(`/admin/referee-access/${encodeURIComponent(grantItem.email)}`, { method: 'DELETE' }); await Promise.all([load(), onChanged()]); } catch (cause) { setError(explainApiConnectionError(cause, 'Could not remove referee access.')); } finally { setBusy(false); } })(); });
  if (!visible) return null;
  return <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Text style={[styles.formGroupTitle, { color: colors.primary, marginTop: 0 }]}>REFEREE ACCESS</Text>
    <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: -7, marginBottom: 12 }]}>Approve a verified account here, then assign them to a match. Match invitations require a manual response.</Text>
    <View style={[styles.addAdminRow, { borderColor: colors.border }]}><TextInput accessibilityLabel="Verified referee email" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" placeholder="Verified account email" placeholderTextColor={colors.mutedForeground} value={email} onChangeText={setEmail} editable={!busy} style={[styles.adminEmailInput, { color: colors.foreground }]} /><Pressable accessibilityRole="button" disabled={busy || !email.trim()} onPress={grant} style={[styles.grantButton, { backgroundColor: colors.primary, opacity: busy || !email.trim() ? .55 : 1 }]}><Feather name="user-plus" size={15} color={colors.primaryForeground} /><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Approve'}</Text></Pressable></View>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    {grants.length ? grants.map(item => <View key={item.email} style={[styles.adminGrantRow, { borderTopColor: colors.border }]}><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.grantEmail, { color: colors.foreground }]}>{item.email}</Text><Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 3 }]}>Approved referee</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Remove referee access for ${item.email}`} disabled={busy} onPress={() => revoke(item)} style={[styles.revokeButton, { borderColor: colors.destructive, opacity: busy ? .5 : 1 }]}><Text style={[styles.revokeText, { color: colors.destructive }]}>Remove</Text></Pressable></View>) : <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 12 }]}>No referee accounts have been added here.</Text>}
  </View>;
}

type RefereeApplicationItem = { id: string; matchId: string; refereeUserId: string; refereeName: string; refereeEmail: string; venueName: string; neighborhood: string; startsAt: string; status: string };
type RefereeAssignmentItem = { matchId: string; venueName: string; neighborhood: string; startsAt: string; refereeUserId: string | null; refereeName: string | null; assignmentStatus: string | null };
function RefereeAssignmentReview({ visible }: { visible: boolean }) {
  const colors = useColors(); const { getToken } = useAuth();
  const [applications, setApplications] = useState<RefereeApplicationItem[]>([]); const [assignments, setAssignments] = useState<RefereeAssignmentItem[]>([]);
  const [busyId, setBusyId] = useState(''); const [error, setError] = useState('');
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(body?.error || 'Could not update referee assignment.');
    return body;
  }, [getToken]);
  const load = useCallback(async () => {
    if (!visible) return;
    try { const result = await request('/admin/referee-applications') as { applications: RefereeApplicationItem[]; assignments: RefereeAssignmentItem[] }; setApplications(result.applications); setAssignments(result.assignments); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load referee applications.'); }
  }, [request, visible]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!visible) return; const timer = setInterval(() => { void load(); }, 30_000); return () => clearInterval(timer); }, [load, visible]);
  const reviewApplication = (application: RefereeApplicationItem, action: 'invite' | 'reject') => {
    const inviting = action === 'invite';
    confirmAdminAction(inviting ? 'Approve and request referee?' : 'Decline referee application?', inviting ? `Approve ${application.refereeName} for ${application.venueName}? After sending the request, contact them at ${application.refereeEmail || 'their account'} to coordinate. The assignment is still not final until they confirm and you confirm it here.` : `Decline ${application.refereeName}'s request for ${application.venueName}?`, inviting ? 'Approve & request' : 'Decline application', !inviting, () => { void (async () => { setBusyId(application.id); try { const result = await request(`/admin/referee-applications/${application.id}`, { method: 'PATCH', body: JSON.stringify({ action }) }) as { message?: string }; if (inviting && result.message) Alert.alert('Request sent', result.message); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not review this application.'); } finally { setBusyId(''); } })(); });
  };
  const finalize = (assignment: RefereeAssignmentItem) => confirmAdminAction('Confirm referee assignment?', `${assignment.refereeName || 'This referee'} confirmed availability for ${assignment.venueName}. Finalize the assignment and enable match controls?`, 'Confirm assignment', false, () => { void (async () => { setBusyId(assignment.matchId); try { await request(`/admin/matches/${assignment.matchId}/referee-assignment`, { method: 'PATCH', body: JSON.stringify({ action: 'confirm' }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm the assignment.'); } finally { setBusyId(''); } })(); });
  if (!visible) return null;
  const awaitingResponse = assignments.filter(item => item.assignmentStatus === 'pending');
  const awaitingFinal = assignments.filter(item => item.assignmentStatus === 'referee_confirmed');
  const confirmed = assignments.filter(item => item.assignmentStatus === 'accepted');
  return <View style={[styles.accessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.accessHeading}><View style={{ flex: 1 }}><Text style={[styles.formGroupTitle, { color: colors.primary, marginTop: 0, marginBottom: 4 }]}>REFEREE ASSIGNMENTS</Text><Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 0 }]}>Review applications, then wait for the referee and admin to confirm. Contact applicants yourself after approving their request.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh referee requests" onPress={() => void load()} style={[styles.iconAction, { borderColor: colors.border }]}><Feather name="refresh-cw" size={14} color={colors.primary} /></Pressable></View>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <Text style={[styles.refereeSubhead, { color: colors.foreground }]}>APPLICATIONS · {applications.length}</Text>
    {applications.length ? applications.map(application => <View key={application.id} style={[styles.requestCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.venue, { color: colors.foreground }]}>{application.refereeName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{application.refereeEmail || 'No verified email'} · {application.venueName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{application.neighborhood} · {formatRiyadhDateTime(application.startsAt)} Riyadh</Text>
      <View style={styles.reviewActions}><Pressable accessibilityRole="button" disabled={!!busyId} onPress={() => reviewApplication(application, 'reject')} style={[styles.rejectButton, { borderColor: colors.destructive, opacity: busyId ? .5 : 1 }]}><Text style={[styles.revokeText, { color: colors.destructive }]}>Decline</Text></Pressable><Pressable accessibilityRole="button" disabled={!!busyId} onPress={() => reviewApplication(application, 'invite')} style={[styles.approveButton, { backgroundColor: colors.primary, opacity: busyId ? .5 : 1 }]}><Feather name="send" size={14} color={colors.primaryForeground} /><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{busyId === application.id ? 'Sending…' : 'Approve & request'}</Text></Pressable></View>
    </View>) : <Text style={[styles.meta, { color: colors.mutedForeground }]}>No applications waiting for review.</Text>}
    <Text style={[styles.refereeSubhead, { color: colors.foreground }]}>WAITING FOR REFEREE · {awaitingResponse.length}</Text>
    {awaitingResponse.map(item => <Text key={item.matchId} style={[styles.assignmentLine, { color: colors.mutedForeground }]}>{item.venueName} · {item.refereeName || 'Referee'} · Request sent, waiting for response</Text>)}
    <Text style={[styles.refereeSubhead, { color: colors.foreground }]}>YOUR CONFIRMATION NEEDED · {awaitingFinal.length}</Text>
    {awaitingFinal.map(item => <View key={item.matchId} style={[styles.assignmentRow, { borderTopColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.venue, { color: colors.foreground }]}>{item.venueName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.refereeName || 'Referee'} · {formatRiyadhDateTime(item.startsAt)} Riyadh</Text></View><Pressable accessibilityRole="button" disabled={!!busyId} onPress={() => finalize(item)} style={[styles.finalizeButton, { backgroundColor: colors.primary, opacity: busyId ? .55 : 1 }]}><Text style={[styles.grantButtonText, { color: colors.primaryForeground }]}>{busyId === item.matchId ? 'Saving…' : 'Confirm'}</Text></Pressable></View>)}
    <Text style={[styles.refereeSubhead, { color: colors.foreground }]}>CONFIRMED · {confirmed.length}</Text>
    {confirmed.slice(0, 5).map(item => <Text key={item.matchId} style={[styles.assignmentLine, { color: colors.mutedForeground }]}>{item.venueName} · {item.refereeName || 'Referee'} · {formatRiyadhDateTime(item.startsAt)} Riyadh</Text>)}
  </View>;
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 16 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '800' },
  addButton: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  adminNote: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9, marginBottom: 15 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
  accessCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 15 },
  ownerInput: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  ownerAddressInput: { minHeight: 70, textAlignVertical: 'top' },
  ownerGrantButton: { minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  requestCount: { minHeight: 28, borderRadius: 14, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  requestCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  requestPhotos: { flexDirection: 'row', gap: 8, marginTop: 10 },
  requestPhoto: { width: 72, height: 62, borderWidth: 1, borderRadius: 9 },
  refereeSubhead: { fontSize: 12, fontWeight: '800', letterSpacing: .4, marginTop: 16, marginBottom: 8 },
  assignmentLine: { fontSize: 13, lineHeight: 19, marginBottom: 7 },
  assignmentRow: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 8 },
  finalizeButton: { minWidth: 78, minHeight: 42, borderRadius: 11, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  reviewActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rejectButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  approveButton: { minHeight: 44, flex: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  accessHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ownerBadge: { minHeight: 28, borderRadius: 14, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  ownerBadgeText: { fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  accessEmail: { fontSize: 12, fontWeight: '800', marginTop: 10, marginBottom: 12 },
  addAdminRow: { minHeight: 50, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', padding: 4, gap: 5 },
  adminEmailInput: { flex: 1, minWidth: 0, height: 42, paddingHorizontal: 10, fontSize: 12 },
  grantButton: { minHeight: 42, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  grantButtonText: { fontSize: 12, fontWeight: '800' },
  adminGrantRow: { minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grantEmail: { fontSize: 11, fontWeight: '700' },
  revokeButton: { minHeight: 40, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  revokeText: { fontSize: 10, fontWeight: '800' },
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
  photoHint: { fontSize: 11, lineHeight: 16, marginTop: -5, marginBottom: 12 },
  refereeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  refereeOption: { minHeight: 44, maxWidth: '100%', borderWidth: 1, borderRadius: 13, paddingVertical: 5, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  refereeAvatar: { width: 30, height: 30, borderRadius: 15 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  photoPreviewWrap: { width: 84, height: 84 },
  photoPreview: { width: 84, height: 84, borderRadius: 12 },
  removePhoto: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { minHeight: 84, minWidth: 100, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  addPhotoText: { fontSize: 10, fontWeight: '700' },
  inlineFields: { flexDirection: 'row', gap: 12 },
  statusChoices: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  statusChoice: { borderWidth: 1, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12 },
  toggleRow: { minHeight: 48, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 12, fontWeight: '600' },
  toggle: { width: 42, height: 24, borderRadius: 15, padding: 4, justifyContent: 'center' },
  toggleDot: { width: 16, height: 16, borderRadius: 8 },
  error: { fontSize: 12, lineHeight: 18, marginVertical: 12 },
});
