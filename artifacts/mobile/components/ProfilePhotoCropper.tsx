import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Cropper from 'react-easy-crop';
import { useColors } from '@/hooks/useColors';

type CropArea = { x: number; y: number; width: number; height: number };

type ProfilePhotoCropperProps = {
  imageUrl: string | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
};

export function ProfilePhotoCropper({ imageUrl, busy, onCancel, onSave }: ProfilePhotoCropperProps) {
  const colors = useColors();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
    setError('');
  }, [imageUrl]);

  if (!imageUrl) return null;

  const save = async () => {
    if (!cropArea || busy) return;
    setError('');
    try {
      await onSave(await cropToFile(imageUrl, cropArea));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not crop this photo. Choose another image.');
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Adjust profile picture</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Drag the photo to position it. The circle and grid show what will appear in your profile.</Text>
          <View style={styles.cropFrame}>
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid
              objectFit="cover"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, pixels) => setCropArea(pixels)}
            />
          </View>
          <View style={styles.zoomControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={zoom <= 1 || busy} onPress={() => setZoom(value => Math.max(1, value - 0.2))} style={[styles.zoomButton, { borderColor: colors.border }]}>
              <Text style={[styles.zoomText, { color: colors.foreground }]}>−</Text>
            </Pressable>
            <Text style={[styles.zoomLabel, { color: colors.mutedForeground }]}>ZOOM</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={zoom >= 3 || busy} onPress={() => setZoom(value => Math.min(3, value + 0.2))} style={[styles.zoomButton, { borderColor: colors.border }]}>
              <Text style={[styles.zoomText, { color: colors.foreground }]}>+</Text>
            </Pressable>
          </View>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[styles.actionButton, { borderColor: colors.border }]}>
              <Text style={[styles.actionText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !cropArea || busy, busy }} disabled={!cropArea || busy} onPress={() => void save()} style={[styles.actionButton, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: !cropArea || busy ? 0.6 : 1 }]}>
              <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : 'Use photo'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

async function cropToFile(imageUrl: string, area: CropArea): Promise<File> {
  const image = new window.Image();
  const imageLoaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The selected photo could not be loaded. Choose another image.'));
  });
  image.src = imageUrl;
  await imageLoaded;

  const size = Math.min(1024, Math.max(1, Math.round(Math.min(area.width, area.height))));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo cropping is unavailable in this browser.');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not prepare the cropped photo.')), 'image/jpeg', 0.92);
  });
  return new File([blob], 'profile-picture.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18, backgroundColor: 'rgba(0, 0, 0, 0.75)' },
  card: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 20, padding: 18 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7, marginBottom: 15 },
  cropFrame: { width: '100%', aspectRatio: 1, position: 'relative', overflow: 'hidden', borderRadius: 12, backgroundColor: '#101827' },
  zoomControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 13 },
  zoomButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontSize: 22, lineHeight: 26, fontWeight: '600' },
  zoomLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  error: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionButton: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '800' },
});
