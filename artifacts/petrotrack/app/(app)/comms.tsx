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
  Message,
  ROLE_COLORS,
  ROLE_LABELS,
  Role,
  UserAccount,
  messageActivityMs,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab    = 'chats';
type InboxFilter = 'active' | 'archived';
type Colors = ReturnType<typeof useColors>;

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

function conversationTime(message?: Message): string {
  if (!message) return '';
  const date = new Date(message.createdAt ?? '');
  if (Number.isNaN(date.getTime())) return message.ts;
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
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
    sendMessage, markRead, getConversation,
    archiveConversation, unarchiveConversation,
  } = useApp();
  const colors    = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;

  // All active users that are not the current user
  const peerUsers: UserAccount[] = userAccounts.filter(
    a => a.status === 'active' && a.empName !== userName,
  );

  // ── Tab state ────────────────────────────────────────────────────────────
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('active');
  const [showNewMessage, setShowNewMessage] = useState(false);

  // ── Direct message state ───────────────────────────────────────────────────
  const [chatPeer,     setChatPeer]     = useState<UserAccount | null>(null);
  const [draft,        setDraft]        = useState('');
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Contact search ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Group message state ────────────────────────────────────────────────────
  const [showGroupCompose, setShowGroupCompose] = useState(false);
  const [groupRecipients, setGroupRecipients] = useState<string[]>([]);
  const [groupDraft, setGroupDraft] = useState('');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function peerUnread(user: UserAccount): number {
    return getConversation(user.empName)
      .filter(message => (message.to === userName || message.to === role) && !message.read)
      .length;
  }

  function lastMsg(user: UserAccount): string {
    const conv = getConversation(user.empName);
    if (!conv.length) return 'Tap to start chatting';
    const m = conv[conv.length - 1];
    const prefix = m.from === userName ? 'You: ' : '';
    if (m.type === 'call') {
      return prefix + `${m.call?.kind === 'video' ? 'Video' : 'Audio'} call`;
    }
    if (m.type === 'media') {
      const label = m.media?.mimeType?.startsWith('image/') ? 'Photo'
        : m.media?.mimeType?.startsWith('video/') ? 'Video'
        : `File: ${m.media?.name || 'Document'}`;
      return prefix + label;
    }
    return prefix + m.body;
  }

  function hasConversation(user: UserAccount): boolean {
    return getConversation(user.empName).length > 0;
  }

  function isArchived(user: UserAccount): boolean {
    const conv = getConversation(user.empName);
    return conv.length > 0 && conv.every(message =>
      message.archiveState?.[userName]?.archived ?? message.archivedBy?.includes(userName),
    );
  }

  function openChat(user: UserAccount) {
    setChatPeer(user);
    markRead(user.empName);
    setSearchQuery('');
  }

  function toggleArchive(user: UserAccount) {
    if (isArchived(user)) unarchiveConversation(user.empName);
    else archiveConversation(user.empName);
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
      { text: 'Photo Library',  onPress: handlePickImage },
      { text: 'Video',          onPress: handlePickVideo },
      { text: 'File / Document',onPress: handlePickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handlePickImage() {
    if (!chatPeer) return;
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow photo library access in Settings to use this feature.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.25, base64: true });
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

  // ── Selected group message ─────────────────────────────────────────────────
  function toggleGroupRecipient(user: UserAccount) {
    setGroupRecipients(current => current.includes(user.empName)
      ? current.filter(name => name !== user.empName)
      : [...current, user.empName]);
  }

  function sendGroupMessage() {
    if (groupRecipients.length === 0) {
      Alert.alert('Select recipients', 'Choose at least one active user.');
      return;
    }
    if (!groupDraft.trim()) {
      Alert.alert('Required', 'Message cannot be empty.');
      return;
    }
    const recipients = peerUsers.filter(user => groupRecipients.includes(user.empName));
    recipients.forEach(user => sendMessage(user.empName, {
      type: 'txt',
      body: groupDraft.trim(),
      to: user.empName,
    }));
    const count = recipients.length;
    setGroupRecipients([]);
    setGroupDraft('');
    setShowGroupCompose(false);
    Alert.alert('Message sent', `Sent to ${count} selected user${count === 1 ? '' : 's'}.`);
  }

  // ── Filtered peer list for search ──────────────────────────────────────────
  const chatPeers = userAccounts
    .filter(user => user.empName !== userName)
    .filter(hasConversation);
  const inboxPeers = chatPeers
    .filter(u => inboxFilter === 'archived' ? isArchived(u) : !isArchived(u))
    .sort((a, b) => {
      const aConversation = getConversation(a.empName);
      const bConversation = getConversation(b.empName);
      return messageActivityMs(bConversation[bConversation.length - 1])
        - messageActivityMs(aConversation[aConversation.length - 1]);
    });
  const filteredPeers = searchQuery.trim()
    ? inboxPeers.filter(u => {
        const q = searchQuery.toLowerCase();
        return (
          u.empName.toLowerCase().includes(q) ||
          (ROLE_LABELS[u.role as Role] ?? u.role ?? '').toLowerCase().includes(q) ||
          (u.jobTitle ?? '').toLowerCase().includes(q)
        );
      })
    : inboxPeers;

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
            onPress={() => { toggleArchive(chatPeer); setChatPeer(null); }}
            style={[styles.headerActionBtn, { backgroundColor: colors.background }]}
            accessibilityLabel={isArchived(chatPeer) ? 'Unarchive conversation' : 'Archive conversation'}
          >
            <Ionicons name={isArchived(chatPeer) ? 'archive' : 'archive-outline'} size={18} color={colors.textMuted} />
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
                if (msg.type === 'call' && msg.call) {
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
                        styles.callBubble,
                        isMine
                          ? { backgroundColor: peerCol }
                          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                      ]}>
                        <Ionicons
                          name={msg.call.kind === 'video' ? 'videocam' : 'call'}
                          size={22}
                          color={isMine ? '#fff' : roleColor}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.callBubbleTitle, { color: isMine ? '#fff' : colors.text }]}>
                            {msg.call.kind === 'video' ? 'Video call' : 'Audio call'}
                          </Text>
                          <Text style={[styles.callBubbleSub, { color: isMine ? 'rgba(255,255,255,0.72)' : colors.textMuted }]}>
                            In-app calling has been discontinued.
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }
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

  // ── Main list view ─────────────────────────────────────────────────
  return (
    <ScreenLayout title="My Chats">
      <Modal
        visible={showNewMessage}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewMessage(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowNewMessage(false)}>
          <Pressable
            style={[styles.contactPicker, { backgroundColor: colors.surface }]}
            onPress={() => undefined}
          >
            <View style={styles.contactPickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.composeTitle, { color: colors.text }]}>New message</Text>
                <Text style={[styles.contactPickerHint, { color: colors.textMuted }]}>
                  All active staff contacts
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowNewMessage(false)}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {peerUsers.map(user => (
                <TouchableOpacity
                  key={user.id}
                  style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                  onPress={() => { setShowNewMessage(false); setChatPeer(user); }}
                >
                  <UserAvatar account={user} size={38} colors={colors} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.contactName, { color: colors.text }]}>{user.empName}</Text>
                    <Text style={[styles.contactSub, { color: colors.textMuted }]}>
                      {ROLE_LABELS[user.role as Role] ?? user.role ?? 'Staff'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={showGroupCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGroupCompose(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowGroupCompose(false)}>
          <Pressable
            style={[styles.contactPicker, { backgroundColor: colors.surface }]}
            onPress={() => undefined}
          >
            <View style={styles.contactPickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.composeTitle, { color: colors.text }]}>Message selected users</Text>
                <Text style={[styles.contactPickerHint, { color: colors.textMuted }]}>
                  {groupRecipients.length} recipient{groupRecipients.length === 1 ? '' : 's'} selected
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setShowGroupCompose(false); setGroupRecipients([]); }}
              >
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {peerUsers.map(user => {
                const selected = groupRecipients.includes(user.empName);
                return (
                  <TouchableOpacity
                    key={user.id}
                    style={[
                      styles.pickerRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: selected ? roleColor + '10' : 'transparent',
                      },
                    ]}
                    onPress={() => toggleGroupRecipient(user)}
                  >
                    <UserAvatar account={user} size={38} colors={colors} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.contactName, { color: colors.text }]}>{user.empName}</Text>
                      <Text style={[styles.contactSub, { color: colors.textMuted }]}>
                        {ROLE_LABELS[user.role as Role] ?? user.role ?? 'Staff'}
                      </Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? roleColor : colors.textSubtle}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={[styles.composeInput, styles.composeBodyInput, styles.groupMessageInput, {
                backgroundColor: colors.background,
                borderColor: colors.inputBorder,
                color: colors.text,
              }]}
              value={groupDraft}
              onChangeText={setGroupDraft}
              placeholder="Write a message to the selected users…"
              placeholderTextColor={colors.textSubtle}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendGroupBtn, { backgroundColor: groupRecipients.length > 0 && groupDraft.trim() ? roleColor : colors.border }]}
              onPress={sendGroupMessage}
              disabled={groupRecipients.length === 0 || !groupDraft.trim()}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={14} color="#fff" />
              <Text style={styles.sendGroupBtnText}>Send to selected users</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

           <TouchableOpacity
             style={[styles.newMessageBtn, { backgroundColor: roleColor }]}
             onPress={() => setShowNewMessage(true)}
             activeOpacity={0.85}
           >
             <Ionicons name="create-outline" size={16} color="#fff" />
             <Text style={styles.newMessageBtnText}>New message</Text>
           </TouchableOpacity>
           <TouchableOpacity
             style={[styles.groupMessageBtn, { backgroundColor: colors.surface, borderColor: roleColor }]}
             onPress={() => setShowGroupCompose(true)}
             activeOpacity={0.85}
           >
             <Ionicons name="people-outline" size={16} color={roleColor} />
             <Text style={[styles.groupMessageBtnText, { color: roleColor }]}>Message selected users</Text>
           </TouchableOpacity>

           <View style={[styles.inboxFilter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
             {([
               { id: 'active' as InboxFilter, label: 'Inbox', icon: 'chatbubbles-outline' },
               { id: 'archived' as InboxFilter, label: 'Archived', icon: 'archive-outline' },
             ]).map(filter => (
               <TouchableOpacity
                 key={filter.id}
                 onPress={() => setInboxFilter(filter.id)}
                 style={[
                   styles.inboxFilterItem,
                   inboxFilter === filter.id && { backgroundColor: roleColor },
                 ]}
               >
                 <Ionicons name={filter.icon as any} size={14} color={inboxFilter === filter.id ? '#fff' : colors.textMuted} />
                 <Text style={[styles.inboxFilterText, { color: inboxFilter === filter.id ? '#fff' : colors.textMuted }]}>
                   {filter.label}
                 </Text>
               </TouchableOpacity>
             ))}
           </View>

            {chatPeers.length === 0 && (
            <View style={[styles.emptyState, { marginTop: 32 }]}>
               <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No chats yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  Start a chat with an active staff member. Your conversation will stay here.
              </Text>
            </View>
          )}

           {/* No inbox results */}
            {chatPeers.length > 0 && filteredPeers.length === 0 && (
            <View style={[styles.emptyState, { marginTop: 32 }]}>
              <Ionicons name="search-outline" size={40} color={colors.border} />
               <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {inboxFilter === 'archived' ? 'No Archived Chats' : 'No Active Chats'}
               </Text>
               <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {searchQuery ? 'Try a different name or role.' : 'Chats remain available in the other view.'}
               </Text>
            </View>
          )}

           {/* One row per conversation, most recently active first. */}
          {filteredPeers.map(user => {
            const unread   = peerUnread(user);
            const lastText = lastMsg(user);
             const conversation = getConversation(user.empName);
             const lastMessage = conversation[conversation.length - 1];
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
                   <Text style={[styles.contactSub, { color: colors.textMuted, fontWeight: unread > 0 ? '700' : '400' }]} numberOfLines={1}>
                    {lastText}
                  </Text>
                   <Text style={[styles.contactStatus, { color: unread > 0 ? roleColor : colors.textSubtle }]}>
                     {unread > 0 ? `${unread} unread` : 'Read'}
                   </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                   <Text style={[styles.conversationTime, { color: unread > 0 ? roleColor : colors.textSubtle }]}>
                     {conversationTime(lastMessage)}
                   </Text>
                   <TouchableOpacity
                     onPress={() => toggleArchive(user)}
                     style={[styles.archiveIconBtn, { backgroundColor: colors.background }]}
                     accessibilityLabel={isArchived(user) ? 'Unarchive conversation' : 'Archive conversation'}
                   >
                     <Ionicons name={isArchived(user) ? 'archive' : 'archive-outline'} size={15} color={colors.textMuted} />
                   </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
    </ScreenLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // List
  listScroll: { padding: 16, paddingBottom: 32 },

  // Search bar
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  newMessageBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginBottom: 10 },
  newMessageBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  inboxFilter:       { flexDirection: 'row', borderWidth: 1, borderRadius: 11, padding: 3, marginBottom: 12 },
  inboxFilterItem:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  inboxFilterText:   { fontSize: 12, fontWeight: '700' },

  // Group message
  groupMessageBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  groupMessageBtnText: { fontSize: 13, fontWeight: '700' },

  // Contact row
  contactRow:     { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  contactName:    { fontSize: 14, fontWeight: '700' },
  contactRole:    { fontSize: 10, fontWeight: '700', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  contactSub:     { fontSize: 11, marginTop: 1 },
  contactStatus:  { fontSize: 10, fontWeight: '700', marginTop: 2 },
  conversationTime: { fontSize: 10, fontWeight: '700' },
  avatarBadge:    { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderWidth: 1.5, borderColor: '#fff' },
  avatarBadgeText:{ color: '#fff', fontSize: 8, fontWeight: '800' },
  archiveIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Contact picker
  modalBackdrop:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  contactPicker:      { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  contactPickerHeader:{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  contactPickerHint:  { fontSize: 12, marginTop: 3 },
  pickerRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },

  // Chat thread
  chatHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { marginRight: 2 },
  chatHeaderName: { fontSize: 14, fontWeight: '700' },
  chatHeaderSub:  { fontSize: 11 },
  headerActionBtn:{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatScroll:     { padding: 14, paddingBottom: 8 },
  emptyChat:      { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTextSub:   { fontSize: 12, textAlign: 'center' },

  bubbleRow:   { flexDirection: 'row', marginBottom: 8, maxWidth: '82%' },
  bubbleLeft:  { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble:      { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText:  { fontSize: 14, lineHeight: 20 },
  bubbleTime:  { fontSize: 10, marginTop: 4, textAlign: 'right' },
  callBubble:  { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, borderRadius: 16, padding: 12 },
  callBubbleTitle: { fontSize: 13, fontWeight: '800' },
  callBubbleSub: { fontSize: 11, marginTop: 2 },

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

  composeCard:       { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  composeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  composeTitle:      { flex: 1, fontSize: 14, fontWeight: '700' },
  fieldLabel:        { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  composeInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  composeBodyInput:  { height: 110, textAlignVertical: 'top' },
  groupMessageInput: { height: 92, marginTop: 12 },
  sendGroupBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 10, marginTop: 2 },
  sendGroupBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  audienceChip:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  audienceChipText:  { fontSize: 11, fontWeight: '600' },
  audienceTag:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },

  // Empty state
  emptyState: { alignItems: 'center', marginTop: 56, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyText:  { fontSize: 13, textAlign: 'center' },
});
