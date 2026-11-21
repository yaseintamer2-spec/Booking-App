import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { apiBaseUrl } from '@/lib/apiBaseUrl';

type AppNotification = {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  match: {
    id: string;
    venueName: string;
    neighborhood: string;
    startsAt: string;
    priceHalalas: number;
  } | null;
};

export function NotificationsButton() {
  const colors = useColors();
  const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  const loadNotifications = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBaseUrl}/api/me/notifications`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load notifications.');
      setNotifications(payload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    void loadNotifications();
    const timer = setInterval(() => void loadNotifications(), 30_000);
    return () => clearInterval(timer);
  }, [isSignedIn, loadNotifications]);

  const markAllRead = async () => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api/me/notifications/read-all`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not mark notifications as read.');
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt || readAt })));
  };

  const markNotificationRead = async (id: string) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api/me/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not mark notification as read.');
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt } : notification));
  };

  const openNotification = (notification: AppNotification) => {
    setOpen(false);
    if (!notification.readAt) void markNotificationRead(notification.id).catch((cause) => {
      setError(cause instanceof Error ? cause.message : 'Could not mark notification as read.');
    });
    if (notification.match?.id && ['new_match', 'match_reminder'].includes(notification.kind)) {
      router.push({ pathname: '/match-registration', params: { id: notification.match.id } });
    } else {
      router.push('/(tabs)/my-matches');
    }
  };

  if (!isSignedIn) return null;

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      onPress={() => { setOpen(true); void loadNotifications(); }}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Feather name="bell" size={17} color={colors.foreground} />
      {unreadCount ? <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View> : null}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close notifications" />
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Match news, invitations, and booking updates.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setOpen(false)} style={styles.close}>
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>
          {unreadCount ? <Pressable accessibilityRole="button" onPress={() => void markAllRead().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not mark notifications as read.'))} style={styles.readAll}><Text style={[styles.readAllText, { color: colors.primary }]}>Mark all as read</Text></Pressable> : null}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          {loading && !notifications.length ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>Loading notifications…</Text> : null}
          {!loading && !error && !notifications.length ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>You’re all caught up.</Text> : null}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {notifications.map((notification) => (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                onPress={() => openNotification(notification)}
                style={[styles.item, { borderColor: colors.border, backgroundColor: notification.readAt ? 'transparent' : colors.secondary }]}
              >
                <View style={[styles.itemIcon, { backgroundColor: colors.accent }]}>
                  <Feather name={notification.kind === 'new_match' || notification.kind === 'match_reminder' ? 'calendar' : notification.kind === 'match_invitation' ? 'users' : 'bell'} size={16} color={colors.primary} />
                </View>
                <View style={styles.itemCopy}>
                  <Text style={[styles.kind, { color: colors.primary }]}>{notification.kind.replaceAll('_', ' ').toUpperCase()}</Text>
                  <Text style={[styles.message, { color: colors.foreground }]}>{notification.message}</Text>
                  {notification.match ? <Text style={[styles.matchInfo, { color: colors.mutedForeground }]}>{notification.match.venueName} · {notification.match.neighborhood}{'\n'}{formatDate(notification.match.startsAt)} · {formatTime(notification.match.startsAt)} · {notification.match.priceHalalas === 0 ? 'FREE' : `SAR ${(notification.match.priceHalalas / 100).toFixed(2)}`}</Text> : null}
                </View>
                {!notification.readAt ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const styles = StyleSheet.create({
  button: { height: 42, width: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  panel: { width: '100%', maxWidth: 480, maxHeight: '82%', borderWidth: 1, borderRadius: 20, padding: 18 },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 23, fontFamily: 'Georgia', fontWeight: '700' },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  readAll: { alignSelf: 'flex-end', paddingVertical: 8 },
  readAllText: { fontSize: 11, fontWeight: '700' },
  error: { fontSize: 11, lineHeight: 16, paddingVertical: 8 },
  empty: { fontSize: 12, paddingVertical: 20 },
  list: { flexGrow: 0, flexShrink: 1, maxHeight: '68%', marginTop: 8 },
  item: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1 },
  kind: { fontSize: 8, fontWeight: '800', letterSpacing: 0.9 },
  message: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  matchInfo: { fontSize: 10, lineHeight: 15, marginTop: 7 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginTop: 4 },
});
