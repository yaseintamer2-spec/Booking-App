import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { hasVerifiedOwnerEmail } from '@/lib/roles';
import { loadSampleParticipants, matchRegistrationMock } from '@/data/matchRegistrationMock';

function readCheckInCode(value: string): { matchId: string; token?: string; userId?: string; preview: boolean } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'kickoff:' || !['check-in', 'sample-check-in'].includes(url.hostname)) return null;
    const matchId = url.searchParams.get('matchId');
    const token = url.searchParams.get('token');
    const userId = url.searchParams.get('userId');
    const preview = url.hostname === 'sample-check-in';
    return matchId && (preview ? userId : token) ? { matchId, token: token || undefined, userId: userId || undefined, preview } : null;
  } catch { return null; }
}

export default function StaffCheckInScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth(); const { user } = useUser();
  const { matchId: routeMatchId, returnMatchId: routeReturnMatchId } = useLocalSearchParams<{ matchId?: string; returnMatchId?: string }>();
  const targetMatchId = Array.isArray(routeMatchId) ? routeMatchId[0] : routeMatchId;
  const returnMatchId = Array.isArray(routeReturnMatchId) ? routeReturnMatchId[0] : routeReturnMatchId;
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const scannerRequestId = useRef(0);
  const [staff, setStaff] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [scannerOpen, setScannerOpen] = useState(false); const [cameraActive, setCameraActive] = useState(false); const [scannerMessage, setScannerMessage] = useState(''); const [message, setMessage] = useState(''); const [success, setSuccess] = useState(false); const [ageChecked, setAgeChecked] = useState(false); const [pendingCode, setPendingCode] = useState(''); const [ageGroup, setAgeGroup] = useState('');
  const apiBase = apiBaseUrl;
  useEffect(() => { let active = true; (async () => { if (isLocalPreviewMode && hasVerifiedOwnerEmail(user?.emailAddresses)) { setStaff(true); return; } try { const token = await getToken(); const response = await fetch(`${apiBase}/api/me/match-staff`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active) setStaff(response.ok && result.isStaff === true); } catch { if (active) setStaff(false); } })(); return () => { active = false; }; }, [apiBase, getToken, user?.emailAddresses]);
  const closeScanner = () => { scannerRequestId.current += 1; setScannerOpen(false); setCameraActive(false); scanLock.current = false; };
  const leaveScanner = () => { closeScanner(); if (router.canGoBack()) router.back(); else if (returnMatchId) router.replace(`/referee-match/${encodeURIComponent(returnMatchId)}`); else router.replace('/referee-matches'); };
  const checkIn = async (rawCode: string) => {
    if (busy) return;
    const parsed = readCheckInCode(rawCode);
    if (!parsed) { setScannerMessage('That QR code isn’t a KICKOFF player ticket. Try another code.'); return; }
    if (targetMatchId && parsed.matchId !== targetMatchId) { setScannerMessage('This ticket belongs to a different match. Scan a ticket for this match.'); return; }
    closeScanner();
    setBusy(true); setMessage('');
    try {
      if (isLocalPreviewMode && parsed.preview && parsed.matchId === matchRegistrationMock.match.id && parsed.userId) {
        setAgeGroup(matchRegistrationMock.match.ageGroup);
        setPendingCode(rawCode);
        if (!ageChecked) {
          setSuccess(false);
          setMessage(`This match is for ages ${matchRegistrationMock.match.ageGroup.replace('-', '–')}. Check the player’s age, tick the confirmation, then check them in.`);
          return;
        }
        const samplePlayers = await loadSampleParticipants();
        const samplePlayer = samplePlayers.find(player => player.userId === parsed.userId);
        if (!samplePlayer) throw new Error('This preview ticket is not linked to a registered player.');
        const liveKey = 'kickoff.local-preview.live-match.v2';
        const stored = await AsyncStorage.getItem(liveKey);
        const live = stored ? JSON.parse(stored) : null;
        if (live?.teamsGeneratedAt) throw new Error('Admission is closed because teams have already been generated.');
        const existingPlayers = Array.isArray(live?.players) ? live.players : [];
        if (existingPlayers.some((player: { userId?: string }) => player.userId === samplePlayer.userId)) throw new Error(`${samplePlayer.firstName} is already admitted.`);
        const admitted = [...existingPlayers, { userId: samplePlayer.userId, firstName: samplePlayer.firstName, avatarUrl: samplePlayer.avatarUrl, age: samplePlayer.age ?? null, pitchSlot: samplePlayer.pitchSlot ?? null, liveTeam: null, team: existingPlayers.length % 2 === 0 ? 'red' : 'blue' }];
        const nextLive = live || { id: parsed.matchId, venueName: matchRegistrationMock.match.pitchName, neighborhood: matchRegistrationMock.match.area, durationMinutes: matchRegistrationMock.match.durationHours * 60, liveStatus: 'scheduled', liveStartedAt: null, livePhaseStartedAt: null, liveFirstHalfEndedAt: null, liveSecondHalfStartedAt: null, liveEndedAt: null, score: { red: 0, blue: 0 }, events: [], teamsGeneratedAt: null };
        await AsyncStorage.setItem(liveKey, JSON.stringify({ ...nextLive, players: admitted, registeredCount: samplePlayers.length, checkedInCount: admitted.length }));
        setSuccess(true);
        setMessage(`${samplePlayer.firstName} admitted to the local match.`);
        setPendingCode(''); setAgeChecked(false);
        return;
      }
      if (parsed.preview) throw new Error('Preview tickets only work with the local sample match.');
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
  const startCamera = async () => { const requestId = ++scannerRequestId.current; setScannerOpen(true); setScannerMessage(''); try { const result = permission?.granted ? permission : await requestPermission(); if (scannerRequestId.current !== requestId) return; if (result.granted) { setMessage(''); setCameraActive(true); } else { setCameraActive(false); setScannerMessage('Allow camera access to scan a player ticket.'); } } catch { if (scannerRequestId.current !== requestId) return; setCameraActive(false); setScannerMessage('Could not open the camera. Check camera permission and try again.'); } };
  if (staff === false) return <Screen><BrandHeader back onBack={leaveScanner} subtitle="MATCH CHECK-IN" /><EmptyState icon="lock" title="Check-in access only" body="An approved referee, pitch owner, or admin account is required to scan match tickets." action="Go back" onAction={leaveScanner} /></Screen>;
  return <Screen><BrandHeader back onBack={leaveScanner} subtitle="STAFF CHECK-IN" /><Text style={[styles.kicker, { color: colors.primary }]}>MATCH DAY</Text><Text style={[styles.title, { color: colors.foreground }]}>Scan player QR.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{targetMatchId ? 'Only tickets for this match can be admitted. Check the player’s age before confirming entry.' : 'Open the scanner to read a player’s ticket. Check their age before confirming entry.'}</Text>{pendingCode ? <><View style={[styles.ageCheck, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="shield" size={20} color={colors.primary} /><Text style={[styles.ageCheckText, { color: colors.foreground }]}>Match group: ages {ageGroup.replace('-', '–')}. Verify the player’s age at the venue.</Text></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ageChecked }} onPress={() => setAgeChecked(value => !value)} style={[styles.ageCheck, { borderColor: ageChecked ? colors.primary : colors.border, backgroundColor: colors.card }]}><Feather name={ageChecked ? 'check-square' : 'square'} size={20} color={ageChecked ? colors.primary : colors.mutedForeground} /><Text style={[styles.ageCheckText, { color: colors.foreground }]}>I verified the player meets this age group.</Text></Pressable><Pressable accessibilityRole="button" disabled={!ageChecked || busy} onPress={() => void checkIn(pendingCode)} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !ageChecked || busy ? .5 : 1 }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{busy ? 'Checking…' : 'Confirm age and check in'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPendingCode(''); setAgeGroup(''); setAgeChecked(false); setMessage('Player not checked in. Scan another ticket when ready.'); }} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>Refuse entry / clear scan</Text></Pressable></> : null}
    {!pendingCode && !success ? <Pressable accessibilityRole="button" onPress={() => void startCamera()} style={[styles.primaryButton, styles.openScannerButton, { backgroundColor: colors.primary }]}><Feather name="camera" size={16} color={colors.primaryForeground} /><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Open player scanner</Text></Pressable> : null}
    {message ? <Text accessibilityRole="alert" style={[styles.result, { color: success ? colors.primary : colors.destructive }]}>{message}</Text> : null}
    {success ? <Pressable accessibilityRole="button" onPress={() => { setSuccess(false); setMessage(''); void startCamera(); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Scan next player</Text></Pressable> : null}
    <Modal visible={scannerOpen} transparent animationType="fade" onRequestClose={closeScanner}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.scannerPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.scannerPanelHeader}><View><Text style={[styles.scannerTitle, { color: colors.foreground }]}>Scan player QR</Text><Text style={[styles.scannerSubtitle, { color: colors.mutedForeground }]}>Point the camera at their match ticket.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close scanner" onPress={closeScanner} style={[styles.closeScanner, { backgroundColor: colors.secondary }]}><Feather name="x" size={20} color={colors.foreground} /></Pressable></View>
          <View style={styles.scannerShell}>
            {cameraActive && permission?.granted ? <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={({ message: cameraError }) => { setCameraActive(false); setScannerMessage(cameraError || 'Unable to open the camera. Check camera permission and try again.'); }} onBarcodeScanned={busy || success ? undefined : ({ data }) => { if (scanLock.current) return; scanLock.current = true; void checkIn(data).finally(() => { scanLock.current = false; }); }}>
              <View pointerEvents="none" style={styles.cameraOverlay}>
                <View style={[styles.scanFrame, { borderColor: colors.primary }]}>
                  <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]} /><View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]} /><View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]} />
                </View>
              </View>
            </CameraView> : <View style={styles.cameraPlaceholder}><Feather name="camera" size={28} color={colors.mutedForeground} /><Text style={[styles.cameraText, { color: colors.mutedForeground }]}>{scannerMessage || 'Camera access is needed to scan a player.'}</Text><Pressable accessibilityRole="button" onPress={() => void startCamera()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Allow camera & scan</Text></Pressable></View>}
          </View>
          {scannerMessage && cameraActive ? <Text accessibilityRole="alert" style={[styles.scannerError, { color: colors.destructive }]}>{scannerMessage}</Text> : null}
          <Text style={[styles.scannerFootnote, { color: colors.mutedForeground }]}>The camera closes after a successful scan or when you close this panel.</Text>
        </View>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  kicker: { fontSize: 11, letterSpacing: 0.7, fontWeight: '800', marginTop: 16 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 7 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 18 },
  ageCheck: { minHeight: 56, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  ageCheckText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  openScannerButton: { flexDirection: 'row', gap: 9, marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  scannerPanel: { width: '92%', maxWidth: 330, borderWidth: 1, borderRadius: 22, padding: 16, shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  scannerPanelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 13 },
  scannerTitle: { fontSize: 19, fontWeight: '800' },
  scannerSubtitle: { fontSize: 13, marginTop: 4 },
  closeScanner: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  scannerShell: { width: '100%', maxWidth: 250, aspectRatio: 1, alignSelf: 'center', borderRadius: 17, overflow: 'hidden', backgroundColor: '#06130D' },
  camera: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  cameraOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: '72%', aspectRatio: 1, borderWidth: 2, borderRadius: 18 },
  corner: { position: 'absolute', width: 40, height: 40, borderWidth: 5, borderRadius: 8 },
  cornerTopLeft: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTopRight: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBottomLeft: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBottomRight: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0 },
  cameraPlaceholder: { width: '100%', maxWidth: 250, aspectRatio: 1, alignSelf: 'center', borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', gap: 13, padding: 20 },
  cameraText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  scannerError: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 10 },
  scannerFootnote: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 12 },
  primaryButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  primaryText: { fontSize: 12, fontWeight: '800' },
  result: { fontSize: 13, fontWeight: '700', marginTop: 14 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  secondaryText: { fontSize: 12, fontWeight: '700' },
});

