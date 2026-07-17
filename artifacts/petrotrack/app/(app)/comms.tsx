import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import {
  Broadcast,
  CallRecord,
  Message,
  ROLE_COLORS,
  ROLE_LABELS,
  Role,
  UserAccount,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab    = 'chats' | 'broadcast' | 'calls';
type Colors = ReturnType<typeof useColors>;

const CAN_BROADCAST = ['admin', 'ceo', 'md', 'csm'];

const AUDIENCE_OPTS = [
  { value: 'all',       label: 'All Staff'      },
  { value: 'role:ceo',  label: 'CEO'            },
  { value: 'role:md',   label: 'MD'             },
  { value: 'role:acc',  label: 'Accountant'     },
  { value: 'role:csm',  label: 'CSM'            },
  { value: 'role:mktg', label: 'Marketing'      },
  { value: 'role:mgr',  label: 'Station Mgr'    },
  { value: 'role:att',  label: 'Pump Attendant' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaIcon(mimeType: string): { name: string; color: string } {
  if (mimeType.startsWith('image/'))       return { name: 'image-outline',        color: '#185FA5' };
  if (mimeType.startsWith('video/'))       return { name: 'videocam-outline',      color: '#8e44ad' };
  if (mimeType === 'application/pdf')      return { name: 'document-text-outline', color: '#e53935' };
  if (mimeType.includes('word'))           return { name: 'document-outline',      color: '#185FA5' };
  if (mimeType.includes('sheet') || mimeType.includes('excel'))
                                           return { name: 'grid-outline',          color: '#1a6e3c' };
  return { name: 'attach-outline', color: '#888' };
}

function userColor(account: UserAccount): string {
  return ROLE_COLORS[account.role || ''] || '#888';
}

function userInitials(empName: string): string {
  return empName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

// ─── Module-scope sub-components ──────────────────────────────────────────────

function UserAvatar({ account, size = 40, colors }: { account: UserAccount; size?: number; colors: Colors }) {
  const color    = userColor(account);
  const initials = userInitials(account.empName);
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: color + '44',
    }}>
      <Text style={{ fontSize: size * 0.32, fontWeight: '800', color }}>
        {initials}
      </Text>
    </View>
  );
}

function RoleAvatar({ role, size = 40, colors }: { role: string; size?: number; colors: Colors }) {
  const color    = ROLE_COLORS[role] || colors.primary;
  const label    = ROLE_LABELS[role as Role] ?? role;
  const initials = label.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: color + '44',
    }}>
      <Text style={{ fontSize: size * 0.32, fontWeight: '800', color }}>
        {initials}
      </Text>
    </View>
  );
}

function MediaBubble({
  msg, isMine, peerColor, colors, onViewImage,
}: {
  msg: Message; isMine: boolean; peerColor: string; colors: Colors;
  onViewImage: (uri: string) => void;
}) {
  const { media } = msg;
  if (!media) return null;

  const isImage = media.mimeType.startsWith('image/');
  const isVideo = media.mimeType.startsWith('video/');
  const icon    = mediaIcon(media.mimeType);

  async function openMedia() {
    const m = msg.media;
    if (!m) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(m.uri, { mimeType: m.mimeType });
      } else {
        await Linking.openURL(m.uri);
      }
    } catch {
      Alert.alert('Cannot Open', 'Unable to open this file on your device.');
    }
  }

  if (isImage) {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onViewImage(media.uri)}
        style={[
          styles.mediaBubble,
          isMine
            ? { backgroundColor: peerColor, borderBottomRightRadius: 4 }
            : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
        ]}
      >
        <Image
          source={{ uri: media.uri }}
          style={styles.mediaImage}
          resizeMode="cover"
        />
        {!!msg.body && (
          <Text style={[styles.bubbleText, { color: isMine ? '#fff' : colors.text, marginTop: 6 }]}>
            {msg.body}
          </Text>
        )}
        <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textSubtle }]}>
          {msg.ts} · tap to expand
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={openMedia}
      style={[
        styles.mediaBubble, styles.fileBubble,
        isMine
          ? { backgroundColor: peerColor, borderBottomRightRadius: 4 }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
      ]}
    >
      <View style={[styles.fileIconBox, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : icon.color + '18' }]}>
        <Ionicons name={icon.name as any} size={22} color={isMine ? '#fff' : icon.color} />
        {isVideo && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={8} color="#fff" />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[styles.fileName, { color: isMine ? '#fff' : colors.text }]}
          numberOfLines={2}
        >
          {media.name}
        </Text>
        <Text style={[styles.fileMeta, { color: isMine ? 'rgba(255,255,255,0.65)' : colors.textSubtle }]}>
          {isVideo ? 'Video' : media.mimeType === 'application/pdf' ? 'PDF' : 'File'}
          {media.size ? ` · ${formatBytes(media.size)}` : ''} · tap to open
        </Text>
      </View>
      <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.5)' : colors.textSubtle, alignSelf: 'flex-end' }]}>
        {msg.ts}
      </Text>
    </TouchableOpacity>
  );
}

function ImageViewerModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.imgViewerBg} onPress={onClose}>
        <TouchableOpacity style={styles.imgViewerClose} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Pressable onPress={() => {/* prevent close on image tap */}}>
          <Image source={{ uri }} style={styles.imgViewerImg} resizeMode="contain" />
        </Pressable>
        <Text style={styles.imgViewerHint}>Tap outside to close</Text>
      </Pressable>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CommsScreen() {
  const {
    role, userName, userAccounts,
    sendMessage, markRead, getConversation, unreadCount,
    broadcasts, addBroadcast,
    callLog, addCallRecord,
  } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;

  // All active users that are not the current user
  const peerUsers: UserAccount[] = userAccounts.filter(
    a => a.status === 'active' && a.empName !== userName,
  );

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('chats');

  // ── Direct message state ───────────────────────────────────────────────────
  const [chatPeer,     setChatPeer]     = useState<UserAccount | null>(null);
  const [draft,        setDraft]        = useState('');
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Contact search ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Broadcast compose state ────────────────────────────────────────────────
  const [showCompose, setShowCompose] = useState(false);
  const [bTitle,      setBTitle]      = useState('');
  const [bBody,       setBBody]       = useState('');
  const [bAudience,   setBAudience]   = useState('all');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function peerUnread(user: UserAccount): number {
    return getConversation(user.empName).filter(m => m.to === userName && !m.read).length;
  }

  function lastMsg(user: UserAccount): string {
    const conv = getConversation(user.empName);
    if (!conv.length) return 'Tap to start chatting';
    const m = conv[conv.length - 1];
    const prefix = m.from === userName ? 'You: ' : '';
    if (m.type === 'media') {
      const label = m.media?.mimeType?.startsWith('image/') ? '📷 Photo'
        : m.media?.mimeType?.startsWith('video/') ? '🎬 Video'
        : `📎 ${m.media?.name || 'File'}`;
      return prefix + label;
    }
    return prefix + m.body;
  }

  function openChat(user: UserAccount) {
    setChatPeer(user);
    markRead(user.empName);
    setSearchQuery('');
  }

  function sendDM() {
    if (!chatPeer || !draft.trim()) return;
    sendMessage(chatPeer.empName, { type: 'txt', body: draft.trim(), to: chatPeer.empName });
    setDraft('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
  }

  // ── Media picker ───────────────────────────────────────────────────────────
  function handleAttach() {
    Alert.alert('Send Attachment', 'Choose a file type', [
      { text: 'Camera',         onPress: () => handlePickImage('camera') },
      { text: 'Photo Library',  onPress: () => handlePickImage('library') },
      { text: 'Video',          onPress: handlePickVideo },
      { text: 'File / Document',onPress: handlePickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handlePickImage(source: 'camera' | 'library') {
    if (!chatPeer) return;
    const permResult = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow access in Settings to use this feature.');
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.25, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.25, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const b64   = asset.base64 || '';
    if (b64.length > 500_000) {
      Alert.alert('Image Too Large', 'This image is too large to send in-app. Please select a smaller or lower-resolution photo.');
      return;
    }
    const uri = b64 ? `data:image/jpeg;base64,${b64}` : asset.uri;
    sendMessage(chatPeer.empName, {
      type: 'media', body: '', to: chatPeer.empName,
      media: { uri, name: asset.fileName || 'photo.jpg', mimeType: 'image/jpeg', size: asset.fileSize },
    });
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 120);
  }

  async function handlePickVideo() {
    if (!chatPeer) return;
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow media access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (result.canceled) return;
    const asset = result.assets[0];
    sendMessage(chatPeer.empName, {
      type: 'media', body: '', to: chatPeer.empName,
      media: { uri: asset.uri, name: asset.fileName || 'video.mp4', mimeType: 'video/mp4', size: asset.fileSize },
    });
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 120);
  }

  async function handlePickDocument() {
    if (!chatPeer) return;
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const doc = result.assets[0];
    sendMessage(chatPeer.empName, {
      type: 'media', body: '', to: chatPeer.empName,
      media: { uri: doc.uri, name: doc.name, mimeType: doc.mimeType || 'application/octet-stream', size: doc.size ?? undefined },
    });
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 120);
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────
  function sendBroadcast() {
    if (!bTitle.trim() || !bBody.trim()) {
      Alert.alert('Required', 'Subject and message cannot be empty.');
      return;
    }
    const audienceLabel = AUDIENCE_OPTS.find(o => o.value === bAudience)?.label || 'All Staff';
    addBroadcast({
      from: role!, fromName: userName,
      title: bTitle.trim(), body: bBody.trim(),
      audience: bAudience, audienceName: audienceLabel,
    });
    setBTitle(''); setBBody(''); setBAudience('all');
    setShowCompose(false);
    Alert.alert('Sent', `Broadcast delivered to ${audienceLabel}.`);
  }

  // ── Calls ──────────────────────────────────────────────────────────────────
  function initiateCall(user: UserAccount) {
    const phone = user.phoneNumber?.trim();
    if (!phone) {
      Alert.alert('No Phone Number', `${user.empName} doesn't have a phone number on file.`);
      return;
    }
    addCallRecord({ from: role!, fromName: userName, to: user.role!, toName: user.empName, status: 'ended' });
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Cannot Open Dialer', 'Your device could not open the phone dialer.'),
    );
  }

  // ── Filtered peer list for search ──────────────────────────────────────────
  const filteredPeers = searchQuery.trim()
    ? peerUsers.filter(u => {
        const q = searchQuery.toLowerCase();
        return (
          u.empName.toLowerCase().includes(q) ||
          (ROLE_LABELS[u.role as Role] ?? u.role ?? '').toLowerCase().includes(q) ||
          (u.jobTitle ?? '').toLowerCase().includes(q)
        );
      })
    : peerUsers;

  // ── Chat thread view ───────────────────────────────────────────────────────
  if (chatPeer) {
    const peerCol = userColor(chatPeer);
    const conv    = getConversation(chatPeer.empName);

    return (
      <ScreenLayout title={chatPeer.empName}>
        {viewingImage && (
          <ImageViewerModal uri={viewingImage} onClose={() => setViewingImage(null)} />
        )}

        {/* Thread header */}
        <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => { markRead(chatPeer.empName); setChatPeer(null); }}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={roleColor} />
          </TouchableOpacity>
          <UserAvatar account={chatPeer} size={36} colors={colors} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.chatHeaderName, { color: colors.text }]}>{chatPeer.empName}</Text>
            <Text style={[styles.chatHeaderSub,  { color: colors.textMuted }]}>
              {chatPeer.jobTitle || ROLE_LABELS[chatPeer.role as Role] || chatPeer.role || 'Staff'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => initiateCall(chatPeer)}
            style={[styles.callBtn, { backgroundColor: '#27ae60' + '18' }]}
          >
            <Ionicons name="call" size={18} color="#27ae60" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          <ScrollView
            ref={chatScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.chatScroll}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
          >
            {conv.length === 0 ? (
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No messages yet. Say hello!
                </Text>
                <Text style={[styles.emptyTextSub, { color: colors.textSubtle }]}>
                  Use 📎 to send photos, videos, PDFs or files.
                </Text>
              </View>
            ) : (
              conv.map(msg => {
                const isMine = msg.from === userName;
                if (msg.type === 'media') {
                  return (
                    <View
                      key={msg.id}
                      style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}
                    >
                      {!isMine && (
                        <View style={{ marginRight: 6, marginTop: 2 }}>
                          <UserAvatar account={chatPeer} size={26} colors={colors} />
                        </View>
                      )}
                      <MediaBubble
                        msg={msg} isMine={isMine} peerColor={peerCol}
                        colors={colors} onViewImage={setViewingImage}
                      />
                    </View>
                  );
                }
                return (
                  <View
                    key={msg.id}
                    style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}
                  >
                    {!isMine && (
                      <View style={{ marginRight: 6, marginTop: 2 }}>
                        <UserAvatar account={chatPeer} size={26} colors={colors} />
                      </View>
                    )}
                    <View style={[
                      styles.bubble,
                      isMine
                        ? { backgroundColor: peerCol, borderBottomRightRadius: 4 }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                    ]}>
                      <Text style={[styles.bubbleText, { color: isMine ? '#fff' : colors.text }]}>
                        {msg.body}
                      </Text>
                      <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textSubtle }]}>
                        {msg.ts}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Input bar */}
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleAttach}
              style={[styles.attachBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Ionicons name="attach" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={[styles.msgInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={1000}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={sendDM}
            />
            <TouchableOpacity
              onPress={sendDM}
              style={[styles.sendBtn, { backgroundColor: draft.trim() ? roleColor : colors.border }]}
              disabled={!draft.trim()}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScreenLayout>
    );
  }

  // ── Main tabs view ─────────────────────────────────────────────────────────
  const totalUnread = unreadCount();

  return (
    <ScreenLayout title="Communications">
      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {([
          { id: 'chats'     as Tab, label: 'Direct',    icon: 'chatbubbles', badge: totalUnread },
          { id: 'broadcast' as Tab, label: 'Broadcast', icon: 'megaphone',   badge: 0 },
          { id: 'calls'     as Tab, label: 'Calls',     icon: 'call',        badge: 0 },
        ]).map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            style={[styles.tab, activeTab === t.id && { borderBottomColor: roleColor, borderBottomWidth: 2 }]}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons name={t.icon as any} size={15} color={activeTab === t.id ? roleColor : colors.textMuted} />
              {t.badge > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: roleColor }]}>
                  <Text style={styles.tabBadgeText}>{t.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, {
              color:      activeTab === t.id ? roleColor : colors.textMuted,
              fontWeight: activeTab === t.id ? '700' : '500',
            }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Direct Messages tab ── */}
      {activeTab === 'chats' && (
        <ScrollView
          contentContainerStyle={styles.listScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search bar */}
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search staff by name or role…"
              placeholderTextColor={colors.textSubtle}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Broadcast shortcut for authorised users */}
          {CAN_BROADCAST.includes(role || '') && (
            <TouchableOpacity
              style={[styles.broadcastShortcut, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}
              onPress={() => { setActiveTab('broadcast'); setShowCompose(true); }}
              activeOpacity={0.8}
            >
              <Ionicons name="megaphone-outline" size={16} color={roleColor} />
              <Text style={[styles.broadcastShortcutText, { color: roleColor }]}>
                Send a Broadcast to All Staff
              </Text>
              <Ionicons name="chevron-forward" size={14} color={roleColor} />
            </TouchableOpacity>
          )}

          {/* No staff registered */}
          {peerUsers.length === 0 && (
            <View style={[styles.emptyState, { marginTop: 32 }]}>
              <Ionicons name="people-outline" size={44} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Staff</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Register and activate staff accounts to enable direct messaging.
              </Text>
            </View>
          )}

          {/* No search results */}
          {peerUsers.length > 0 && filteredPeers.length === 0 && (
            <View style={[styles.emptyState, { marginTop: 32 }]}>
              <Ionicons name="search-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Staff Found</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Try a different name or role.</Text>
            </View>
          )}

          {/* Contact list — one card per individual user */}
          {filteredPeers.map(user => {
            const unread   = peerUnread(user);
            const lastText = lastMsg(user);
            const uColor   = userColor(user);
            const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role ?? 'Staff';
            return (
              <TouchableOpacity
                key={user.id}
                style={[styles.contactRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openChat(user)}
                activeOpacity={0.8}
              >
                <View style={{ position: 'relative', marginRight: 12 }}>
                  <UserAvatar account={user} size={46} colors={colors} />
                  {unread > 0 && (
                    <View style={[styles.avatarBadge, { backgroundColor: roleColor }]}>
                      <Text style={styles.avatarBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.contactName, { color: colors.text }]}>{user.empName}</Text>
                  <Text style={[styles.contactRole, { color: uColor, backgroundColor: uColor + '18' }]}>
                    {roleLabel}
                  </Text>
                  <Text style={[styles.contactSub, { color: colors.textMuted }]} numberOfLines={1}>
                    {lastText}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => initiateCall(user)}
                    style={[styles.callIconBtn, { backgroundColor: '#27ae60' + '18' }]}
                  >
                    <Ionicons name="call-outline" size={15} color="#27ae60" />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Broadcast tab ── */}
      {activeTab === 'broadcast' && (
        <ScrollView contentContainerStyle={styles.listScroll} showsVerticalScrollIndicator={false}>
          {CAN_BROADCAST.includes(role || '') && !showCompose && (
            <TouchableOpacity
              style={[styles.composeBtn, { backgroundColor: roleColor }]}
              onPress={() => setShowCompose(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="megaphone" size={15} color="#fff" />
              <Text style={styles.composeBtnText}>New Broadcast</Text>
            </TouchableOpacity>
          )}

          {showCompose && (
            <View style={[styles.composeCard, { backgroundColor: colors.surface, borderColor: roleColor + '66' }]}>
              <View style={styles.composeCardHeader}>
                <Ionicons name="megaphone" size={15} color={roleColor} />
                <Text style={[styles.composeTitle, { color: colors.text }]}>New Company Broadcast</Text>
                <TouchableOpacity onPress={() => { setShowCompose(false); setBTitle(''); setBBody(''); }}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Send To</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {AUDIENCE_OPTS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setBAudience(opt.value)}
                      style={[
                        styles.audienceChip,
                        {
                          backgroundColor: bAudience === opt.value ? roleColor : colors.background,
                          borderColor:     bAudience === opt.value ? roleColor : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.audienceChipText, { color: bAudience === opt.value ? '#fff' : colors.textMuted }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Subject</Text>
              <TextInput
                style={[styles.composeInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                value={bTitle}
                onChangeText={setBTitle}
                placeholder="e.g. Fuel Price Update, Safety Notice"
                placeholderTextColor={colors.textSubtle}
              />

              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Message</Text>
              <TextInput
                style={[styles.composeInput, styles.composeBodyInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                value={bBody}
                onChangeText={setBBody}
                placeholder="Write your broadcast message…"
                placeholderTextColor={colors.textSubtle}
                multiline
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.sendBroadcastBtn, { backgroundColor: roleColor }]}
                onPress={sendBroadcast}
                activeOpacity={0.85}
              >
                <Ionicons name="send" size={14} color="#fff" />
                <Text style={styles.sendBroadcastText}>Send Broadcast</Text>
              </TouchableOpacity>
            </View>
          )}

          {broadcasts.length === 0 && !showCompose && (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Broadcasts Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Company-wide announcements will appear here.
              </Text>
            </View>
          )}

          {broadcasts.map(b => {
            const senderColor = ROLE_COLORS[b.from] || colors.primary;
            return (
              <View key={b.id} style={[styles.broadcastCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.broadcastCardHeader}>
                  <RoleAvatar role={b.from} size={36} colors={colors} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.broadcastFrom, { color: colors.text }]}>{b.fromName}</Text>
                    <Text style={[styles.broadcastMeta, { color: colors.textMuted }]}>
                      To: {b.audienceName} · {b.ts.split('T')[0]}
                    </Text>
                  </View>
                  <View style={[styles.audienceTag, { backgroundColor: senderColor + '18', borderColor: senderColor + '44' }]}>
                    <Text style={[styles.audienceChipText, { color: senderColor }]}>{b.audienceName}</Text>
                  </View>
                </View>
                <Text style={[styles.broadcastTitle, { color: colors.text }]}>{b.title}</Text>
                <Text style={[styles.broadcastBody,  { color: colors.textMuted }]}>{b.body}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Calls tab ── */}
      {activeTab === 'calls' && (
        <ScrollView contentContainerStyle={styles.listScroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Staff Directory</Text>

          {peerUsers.length === 0 && (
            <View style={[styles.emptyState, { marginTop: 16 }]}>
              <Ionicons name="people-outline" size={44} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Staff</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No active staff members to call.</Text>
            </View>
          )}

          {peerUsers.map(user => {
            const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role ?? 'Staff';
            return (
              <View key={user.id} style={[styles.callContactRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ marginRight: 12 }}>
                  <UserAvatar account={user} size={42} colors={colors} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactName, { color: colors.text }]}>{user.empName}</Text>
                  <Text style={[styles.contactSub,  { color: colors.textMuted }]}>{roleLabel}</Text>
                  {user.phoneNumber ? (
                    <Text style={[styles.contactSub, { color: colors.textSubtle }]}>{user.phoneNumber}</Text>
                  ) : (
                    <Text style={[styles.contactSub, { color: colors.textSubtle }]}>No phone on file</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => initiateCall(user)}
                  style={[styles.callNowBtn, { backgroundColor: user.phoneNumber ? '#27ae60' : colors.border }]}
                  disabled={!user.phoneNumber}
                >
                  <Ionicons name="call" size={14} color="#fff" />
                  <Text style={styles.callNowText}>Call</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {callLog.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Recent Calls</Text>
              {callLog.slice(0, 25).map((c: CallRecord) => {
                const isMine     = c.from === role;
                const peerName   = isMine ? c.toName : c.fromName;
                const peerRoleStr = isMine ? (c.to || '') : (c.from || '');
                const statusColor =
                  c.status === 'ended'  ? colors.success :
                  c.status === 'missed' ? colors.error   : colors.warning;
                return (
                  <View key={c.id} style={[styles.callLogRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <RoleAvatar role={peerRoleStr} size={38} colors={colors} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.contactName, { color: colors.text }]}>{peerName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons
                          name={isMine ? 'arrow-up-outline' : 'arrow-down-outline'}
                          size={10}
                          color={colors.textMuted}
                        />
                        <Text style={[styles.contactSub, { color: statusColor }]}>{c.status}</Text>
                        {c.duration && (
                          <Text style={[styles.contactSub, { color: colors.textMuted }]}>· {c.duration}</Text>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.callTime, { color: colors.textSubtle }]}>{c.ts.split('T')[0]}</Text>
                  </View>
                );
              })}
            </>
          )}

          {callLog.length === 0 && peerUsers.length > 0 && (
            <View style={[styles.emptyState, { marginTop: 16 }]}>
              <Ionicons name="call-outline" size={44} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Calls Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Tap Call next to any contact above.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </ScreenLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Tab bar
  tabBar:       { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13 },
  tabLabel:     { fontSize: 12 },
  tabBadge:     { position: 'absolute', top: -4, right: -6, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },

  // List
  listScroll: { padding: 16, paddingBottom: 32 },

  // Search bar
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },

  // Broadcast shortcut
  broadcastShortcut:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  broadcastShortcutText: { flex: 1, fontSize: 13, fontWeight: '600' },

  // Contact row
  contactRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  contactName:    { fontSize: 14, fontWeight: '700' },
  contactRole:    { fontSize: 10, fontWeight: '700', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  contactSub:     { fontSize: 11, marginTop: 1 },
  avatarBadge:    { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: '#fff' },
  avatarBadgeText:{ color: '#fff', fontSize: 8, fontWeight: '800' },
  unreadBadge:    { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText:     { color: '#fff', fontSize: 10, fontWeight: '800' },
  callIconBtn:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Chat thread
  chatHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { marginRight: 2 },
  chatHeaderName: { fontSize: 14, fontWeight: '700' },
  chatHeaderSub:  { fontSize: 11 },
  callBtn:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatScroll:     { padding: 14, paddingBottom: 8 },
  emptyChat:      { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTextSub:   { fontSize: 12, textAlign: 'center' },

  bubbleRow:   { flexDirection: 'row', marginBottom: 8, maxWidth: '82%' },
  bubbleLeft:  { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble:      { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText:  { fontSize: 14, lineHeight: 20 },
  bubbleTime:  { fontSize: 10, marginTop: 4, textAlign: 'right' },

  // Media bubbles
  mediaBubble: { borderRadius: 16, overflow: 'hidden', paddingBottom: 8 },
  mediaImage:  { width: 220, height: 170, borderRadius: 14 },
  fileBubble:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, maxWidth: 260 },
  fileIconBox: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  playBadge:   { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  fileName:    { fontSize: 13, fontWeight: '600' },
  fileMeta:    { fontSize: 10 },

  // Image viewer
  imgViewerBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  imgViewerClose: { position: 'absolute', top: 52, right: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  imgViewerImg:   { width: '100%', aspectRatio: 1 },
  imgViewerHint:  { position: 'absolute', bottom: 42, color: 'rgba(255,255,255,0.4)', fontSize: 12 },

  // Input bar
  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  attachBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  msgInput:  { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 14, maxHeight: 110 },
  sendBtn:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Broadcast
  composeBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 14 },
  composeBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  composeCard:       { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  composeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  composeTitle:      { flex: 1, fontSize: 14, fontWeight: '700' },
  fieldLabel:        { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  composeInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  composeBodyInput:  { height: 110, textAlignVertical: 'top' },
  sendBroadcastBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 10, marginTop: 4 },
  sendBroadcastText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  audienceChip:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  audienceChipText:  { fontSize: 11, fontWeight: '600' },
  audienceTag:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  broadcastCard:       { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  broadcastCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  broadcastFrom:       { fontSize: 13, fontWeight: '700' },
  broadcastMeta:       { fontSize: 11, marginTop: 2 },
  broadcastTitle:      { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  broadcastBody:       { fontSize: 13, lineHeight: 19 },

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 56, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText:  { fontSize: 13, textAlign: 'center' },

  // Calls tab
  sectionTitle:   { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  callContactRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  callNowBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  callNowText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  callLogRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  callTime:       { fontSize: 11, marginRight: 8 },
});
