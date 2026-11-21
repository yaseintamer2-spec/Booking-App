import QRCode from 'react-native-qrcode-svg';
import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

type Props = { value: string; venue: string; expiresAt: string; onClose: () => void; player?: string; pitchSlot?: number | null };

export function CheckInQrModal({ value, venue, expiresAt, onClose, player, pitchSlot }: Props) {
  const colors = useColors();
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close check-in QR" onPress={onClose} style={styles.close} hitSlop={8}>
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Match check-in</Text>
        <Text style={[styles.venue, { color: colors.mutedForeground }]}>{player ? `${player}${pitchSlot == null ? '' : ` · Spot ${pitchSlot + 1}`} · ` : ''}{venue}</Text>
        <View style={[styles.qrFrame, { borderColor: colors.primary }]}>
          <View style={styles.qrQuietZone}><QRCode value={value} size={222} color="#07120A" backgroundColor="#FFFFFF" /></View>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Show this code to a referee or admin. It works once and expires {new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</Text>
        <Text selectable style={[styles.fallback, { color: colors.mutedForeground }]}>{value}</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Close</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 22 }, card: { width: '100%', maxWidth: 360, alignItems: 'center', borderWidth: 1, borderRadius: 22, padding: 22 }, close: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 }, title: { fontSize: 22, fontFamily: 'Georgia', fontWeight: '700', marginTop: 14 }, venue: { fontSize: 12, marginTop: 6, marginBottom: 18 }, qrFrame: { padding: 10, borderWidth: 5, borderRadius: 22, backgroundColor: '#FFFFFF' }, qrQuietZone: { padding: 8, backgroundColor: '#FFFFFF' }, hint: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 16 }, fallback: { fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 8, marginBottom: 2 }, button: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12, width: '100%' }, buttonText: { fontSize: 12, fontWeight: '800' } });

