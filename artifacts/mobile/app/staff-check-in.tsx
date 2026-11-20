import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';

function readCheckInCode(value: string): { matchId: string; token: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'kickoff:' || url.hostname !== 'check-in') return null;
    const matchId = url.searchParams.get('matchId'); const token = url.searchParams.get('token');
    return matchId && token ? { matchId, token } : null;
  } catch { return null; }
}

export default function StaffCheckInScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [staff, setStaff] = useState<boolean | null>(null); const [manualCode, setManualCode] = useState(''); const [busy, setBusy] = useState(false); const [cameraActive, setCameraActive] = useState(false); const [message, setMessage] = useState(''); const [success, setSuccess] = useState(false);
  const apiBase = apiBaseUrl;
  useEffect(() => { let active = true; (async () => { try { const token = await getToken(); const response = await fetch(`${apiBase}/api/me/match-staff`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active) setStaff(response.ok && result.isStaff === true); } catch { if (active) setStaff(false); } })(); return () => { active = false; }; }, [apiBase, getToken]);
  const checkIn = async (rawCode: string) => {
    if (busy) return;
    const parsed = readCheckInCode(rawCode);
    if (!parsed) { setSuccess(false); setMessage('That QR code isn’t a KICKOFF match check-in code.'); setCameraActive(false); return; }
    setBusy(true); setCameraActive(false); setMessage('');
    try {
      const token = await getToken(); const response = await fetch(`${apiBase}/api/admin/matches/${encodeURIComponent(parsed.matchId)}/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ token: parsed.token }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not check this player in.');
      setSuccess(true); setMessage(`${result.playerName} checked in.`); setManualCode('');
    } catch (cause) { setSuccess(false); setMessage(cause instanceof Error ? cause.message : 'Could not check this player in.'); }
    finally { setBusy(false); }
  };
  const startCamera = async () => { const result = permission?.granted ? permission : await requestPermission(); if (result.granted) { setMessage(''); setCameraActive(true); } else Alert.alert('Camera access needed', 'Allow camera access to scan player check-in codes.'); };
  if (staff === false) return <Screen><BrandHeader back subtitle="STAFF CHECK-IN" /><EmptyState icon="lock" title="Staff access only" body="Ask an admin to add your verified account email to MATCH_STAFF_EMAILS." action="Go back" onAction={() => router.back()} /></Screen>;
  return <Screen><BrandHeader back subtitle="STAFF CHECK-IN" /><Text style={[styles.kicker, { color: colors.primary }]}>MATCH DAY</Text><Text style={[styles.title, { color: colors.foreground }]}>Scan player QR.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Referees and admins can verify a player’s single-use match check-in code.</Text>
    {cameraActive && permission?.granted ? <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { if (!busy) void checkIn(data); }} /> : <View style={[styles.cameraPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="camera" size={30} color={colors.mutedForeground} /><Text style={[styles.cameraText, { color: colors.mutedForeground }]}>{permission?.granted ? 'Camera paused' : 'Camera permission is needed to scan'}</Text><Pressable accessibilityRole="button" onPress={() => void startCamera()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{permission?.granted ? 'Start scanner' : 'Allow camera & scan'}</Text></Pressable></View>}
    {message ? <Text accessibilityRole="alert" style={[styles.result, { color: success ? colors.primary : colors.destructive }]}>{message}</Text> : null}
    {success ? <Pressable accessibilityRole="button" onPress={() => { setSuccess(false); setMessage(''); setCameraActive(true); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Scan next player</Text></Pressable> : null}
    <Text style={[styles.manualLabel, { color: colors.mutedForeground }]}>CAMERA NOT WORKING? PASTE THE QR CODE</Text><TextInput accessibilityLabel="Paste player check-in QR code" value={manualCode} onChangeText={setManualCode} autoCapitalize="none" autoCorrect={false} placeholder="kickoff://check-in?matchId=…&token=…" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} /><Pressable accessibilityRole="button" disabled={busy || !manualCode.trim()} onPress={() => void checkIn(manualCode)} style={[styles.secondaryButton, { borderColor: colors.border, opacity: busy || !manualCode.trim() ? 0.5 : 1 }]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>{busy ? 'Checking…' : 'Check in manually'}</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({ kicker: { fontSize: 9, letterSpacing: 1.5, fontWeight: '800', marginTop: 16 }, title: { fontSize: 31, fontFamily: 'Georgia', marginTop: 7 }, subtitle: { fontSize: 12, lineHeight: 19, marginTop: 7, marginBottom: 18 }, camera: { width: '100%', height: 320, borderRadius: 20, overflow: 'hidden' }, cameraPlaceholder: { minHeight: 250, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 13, padding: 20 }, cameraText: { fontSize: 12 }, primaryButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, primaryText: { fontSize: 12, fontWeight: '800' }, result: { fontSize: 13, fontWeight: '700', marginTop: 14 }, manualLabel: { fontSize: 9, letterSpacing: 1.2, fontWeight: '800', marginTop: 22, marginBottom: 8 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 11 }, secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, secondaryText: { fontSize: 12, fontWeight: '700' } });

