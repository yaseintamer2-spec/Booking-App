import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { hasVerifiedOwnerEmail } from '@/lib/roles';
import { matchRegistrationMock } from '@/data/matchRegistrationMock';

function readCheckInCode(value: string): { matchId: string; token: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'kickoff:' || url.hostname !== 'check-in') return null;
    const matchId = url.searchParams.get('matchId'); const token = url.searchParams.get('token');
    return matchId && token ? { matchId, token } : null;
  } catch { return null; }
}

export default function StaffCheckInScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth(); const { user } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [staff, setStaff] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [cameraActive, setCameraActive] = useState(false); const [message, setMessage] = useState(''); const [success, setSuccess] = useState(false); const [ageChecked, setAgeChecked] = useState(false); const [pendingCode, setPendingCode] = useState(''); const [ageGroup, setAgeGroup] = useState('');
  const apiBase = apiBaseUrl;
  useEffect(() => { let active = true; (async () => { if (isLocalPreviewMode && hasVerifiedOwnerEmail(user?.emailAddresses)) { setStaff(true); return; } try { const token = await getToken(); const response = await fetch(`${apiBase}/api/me/match-staff`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active) setStaff(response.ok && result.isStaff === true); } catch { if (active) setStaff(false); } })(); return () => { active = false; }; }, [apiBase, getToken, user?.emailAddresses]);
  useEffect(() => { if (staff && permission?.granted) setCameraActive(true); }, [staff, permission?.granted]);
  const leaveScanner = () => { setCameraActive(false); if (router.canGoBack()) router.back(); else router.replace('/referee-matches'); };
  const checkIn = async (rawCode: string) => {
    if (busy) return;
    const parsed = readCheckInCode(rawCode);
    if (!parsed) { setSuccess(false); setMessage('That QR code isn’t a KICKOFF match check-in code.'); setCameraActive(false); return; }
    setCameraActive(false);
    setBusy(true); setCameraActive(false); setMessage('');
    try {
      if (isLocalPreviewMode && parsed.matchId === matchRegistrationMock.match.id) {
        setAgeGroup(matchRegistrationMock.match.ageGroup);
        setPendingCode(rawCode);
        if (!ageChecked) {
          setSuccess(false);
          setMessage(`This match is for ages ${matchRegistrationMock.match.ageGroup.replace('-', '–')}. Check the player’s age, tick the confirmation, then check them in.`);
          return;
        }
        setSuccess(true);
        setMessage('Player checked in for this local match preview.');
        setPendingCode(''); setAgeChecked(false);
        return;
      }
      const token = await getToken();
      const matchResponse = await fetch(`${apiBase}/api/matches/${encodeURIComponent(parsed.matchId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const match = await matchResponse.json(); if (!matchResponse.ok) throw new Error(match.error || 'Could not load this match age group.');
      setAgeGroup(String(match.ageGroup || '')); setPendingCode(rawCode);
      if (!ageChecked) { setSuccess(false); setMessage(`This match is for ages ${String(match.ageGroup || 'not listed').replace('-', '–')}. Check the player’s age, tick the confirmation, then check them in.`); return; }
      const response = await fetch(`${apiBase}/api/admin/matches/${encodeURIComponent(parsed.matchId)}/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ token: parsed.token, ageChecked: true }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not check this player in.');
      setSuccess(true); setMessage(`${result.playerName} checked in.`); setPendingCode(''); setAgeChecked(false);
    } catch (cause) { setSuccess(false); setMessage(cause instanceof Error ? cause.message : 'Could not check this player in.'); }
    finally { setBusy(false); }
  };
  const startCamera = async () => { try { const result = permission?.granted ? permission : await requestPermission(); if (result.granted) { setMessage(''); setCameraActive(true); } else setMessage('Camera access is blocked. Allow camera access in your browser settings, then try again.'); } catch { setMessage('Could not start the camera. Check browser camera permissions and use a secure localhost or HTTPS address.'); } };
  if (staff === false) return <Screen><BrandHeader back onBack={leaveScanner} subtitle="MATCH CHECK-IN" /><EmptyState icon="lock" title="Check-in access only" body="An approved referee, pitch owner, or admin account is required to scan match tickets." action="Go back" onAction={leaveScanner} /></Screen>;
  return <Screen><BrandHeader back onBack={leaveScanner} subtitle="STAFF CHECK-IN" /><Text style={[styles.kicker, { color: colors.primary }]}>MATCH DAY</Text><Text style={[styles.title, { color: colors.foreground }]}>Scan player QR.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Keep this page open and point the camera at the player’s KICKOFF check-in code. On a laptop, allow camera access when the browser asks.</Text>{pendingCode ? <><View style={[styles.ageCheck, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="shield" size={20} color={colors.primary} /><Text style={[styles.ageCheckText, { color: colors.foreground }]}>Match group: ages {ageGroup.replace('-', '–')}. Verify the player’s age at the venue.</Text></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ageChecked }} onPress={() => setAgeChecked(value => !value)} style={[styles.ageCheck, { borderColor: ageChecked ? colors.primary : colors.border, backgroundColor: colors.card }]}><Feather name={ageChecked ? 'check-square' : 'square'} size={20} color={ageChecked ? colors.primary : colors.mutedForeground} /><Text style={[styles.ageCheckText, { color: colors.foreground }]}>I verified the player meets this age group.</Text></Pressable><Pressable accessibilityRole="button" disabled={!ageChecked || busy} onPress={() => void checkIn(pendingCode)} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !ageChecked || busy ? .5 : 1 }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{busy ? 'Checking…' : 'Confirm age and check in'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPendingCode(''); setAgeGroup(''); setAgeChecked(false); setMessage('Player not checked in. Scan another ticket when ready.'); }} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>Refuse entry / clear scan</Text></Pressable></> : null}
    <View style={styles.scannerShell}>
      {cameraActive && permission?.granted ? <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={({ message: cameraError }) => { setCameraActive(false); setMessage(cameraError || 'Unable to open the camera. Check camera permission and try again.'); }} onBarcodeScanned={({ data }) => { if (!busy) void checkIn(data); }}>
        <View pointerEvents="none" style={styles.cameraOverlay}>
          <View style={[styles.scanFrame, { borderColor: colors.primary }]}>
            <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]} /><View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]} /><View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]} />
          </View>
          <View style={styles.cameraHint}><Text style={styles.cameraHintText}>Center the player’s QR code in the frame</Text></View>
        </View>
      </CameraView> : <View style={[styles.cameraPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="camera" size={30} color={colors.mutedForeground} /><Text style={[styles.cameraText, { color: colors.mutedForeground }]}>{permission?.granted ? 'Scanner paused' : 'Open the camera to scan a player ticket'}</Text><Pressable accessibilityRole="button" onPress={() => void startCamera()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{permission?.granted ? 'Open scanner' : 'Open camera & scan'}</Text></Pressable></View>}
    </View>
    {message ? <Text accessibilityRole="alert" style={[styles.result, { color: success ? colors.primary : colors.destructive }]}>{message}</Text> : null}
    {success ? <Pressable accessibilityRole="button" onPress={() => { setSuccess(false); setMessage(''); setCameraActive(true); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Scan next player</Text></Pressable> : null}
  </Screen>;
}

const styles = StyleSheet.create({ kicker: { fontSize: 9, letterSpacing: 1.5, fontWeight: '800', marginTop: 16 }, title: { fontSize: 31, fontFamily: 'Georgia', marginTop: 7 }, subtitle: { fontSize: 12, lineHeight: 19, marginTop: 7, marginBottom: 18 }, ageCheck: { minHeight: 56, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }, ageCheckText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 18 }, scannerShell: { width: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#06130D' }, camera: { width: '100%', height: 380 }, cameraOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, scanFrame: { width: 240, height: 240, borderWidth: 1, borderRadius: 22, opacity: 0.75 }, corner: { position: 'absolute', width: 34, height: 34, borderWidth: 5, borderRadius: 8 }, cornerTopLeft: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0 }, cornerTopRight: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0 }, cornerBottomLeft: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0 }, cornerBottomRight: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0 }, cameraHint: { position: 'absolute', bottom: 20, backgroundColor: 'rgba(0,0,0,0.68)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 }, cameraHintText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, cameraPlaceholder: { minHeight: 250, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 13, padding: 20 }, cameraText: { fontSize: 12 }, primaryButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, primaryText: { fontSize: 12, fontWeight: '800' }, result: { fontSize: 13, fontWeight: '700', marginTop: 14 }, secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, secondaryText: { fontSize: 12, fontWeight: '700' } });

