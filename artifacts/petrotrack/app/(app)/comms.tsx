import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { ROLE_COLORS, ROLE_LABELS, Role, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  CHAT_REACTIONS, MAX_UPLOAD_BYTES, chatApi, storageApi, uploadFailureMessage,
  type ChatConversation, type ChatMedia, type ChatMember, type ChatMessage, type ChatMessageInfo, type UploadableFile,
} from '@/lib/api';
import { subscribeChatChanges } from '@/lib/chatEvents';
import { startForegroundTimer } from '@/lib/foreground-timer';
import {
  downloadStoredFile, exportStoredFile, printStoredFile, storedFilePreviewRoute, useStoredFileSource,
  type StoredFileRef,
} from '@/lib/stored-files';

type InboxFilter = 'active' | 'archived';
type Colors = ReturnType<typeof useColors>;
interface ViewingImage { source: ImageSourcePropType; file: StoredFileRef }
interface Person { username: string; empName: string; appRole: string | null; subtitle?: string }

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaIcon(mimeType: string): { name: string; color: string } {
  if (mimeType.startsWith('image/'))       return { name: 'image-outline',        color: '#286247' };
  if (mimeType.startsWith('video/'))       return { name: 'videocam-outline',      color: '#8e44ad' };
  if (mimeType === 'application/pdf')      return { name: 'document-text-outline', color: '#365A47' };
  if (mimeType.includes('word'))           return { name: 'document-outline',      color: '#286247' };
  if (mimeType.includes('sheet') || mimeType.includes('excel'))
                                           return { name: 'grid-outline',          color: '#174D36' };
  return { name: 'attach-outline', color: '#888' };
}

function roleColorOf(appRole: string | null | undefined): string {
  return ROLE_COLORS[appRole || ''] || '#6b7d73';
}

function roleLabelOf(appRole: string | null | undefined): string {
  return ROLE_LABELS[appRole as Role] ?? appRole ?? 'Staff';
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clockTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';
}

function listTime(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return clockTime(value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function dayLabel(value: string): string {
  const date = parseDate(value);
  if (!date) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function mediaLabel(media: ChatMedia | null): string {
  if (!media) return '';
  if (media.mimeType?.startsWith('image/')) return '📷 Photo';
  if (media.mimeType?.startsWith('video/')) return '🎬 Video';
  return `📎 ${media.name || 'File'}`;
}

function messagePreview(message: ChatMessage | null, me: string, isGroup: boolean): string {
  if (!message) return 'No messages yet';
  if (message.kind === 'system') return message.body;
  if (message.deleted) return '🚫 This message was deleted';
  const text = message.body || mediaLabel(message.media) || 'Message';
  if (message.sender === me) return `You: ${text}`;
  return isGroup ? `${message.senderName.split(' ')[0]}: ${text}` : text;
}

function directPeer(conversation: ChatConversation, me: string): ChatMember | undefined {
  return conversation.members.find(member => member.username !== me) ?? conversation.members[0];
}

function conversationTitle(conversation: ChatConversation, me: string): string {
  if (conversation.kind === 'group') return conversation.name || 'Group chat';
  return directPeer(conversation, me)?.empName || 'Chat';
}

/** Alert buttons do not work on web, so confirmations use the browser dialog there. */
function confirmAction(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Merges a fresh newest page into the loaded history, keeping older pages. */
function mergeLatest(previous: ChatMessage[], fresh: ChatMessage[], hasMore: boolean): ChatMessage[] {
  if (fresh.length === 0) return hasMore ? previous : [];
  const oldestFresh = fresh[0].id;
  return [...previous.filter(message => message.id < oldestFresh), ...fresh];
}

// ─── Avatars ──────────────────────────────────────────────────────────────────

function Avatar({ name, appRole, size = 40, group = false }: { name: string; appRole?: string | null; size?: number; group?: boolean }) {
  const color = group ? '#1f6f4a' : roleColorOf(appRole);
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: color + '55',
    }}>
      {group
        ? <Ionicons name="people" size={size * 0.46} color={color} />
        : <Text style={{ fontSize: size * 0.34, fontWeight: '800', color }}>{initials(name)}</Text>}
    </View>
  );
}

function ConversationAvatar({ conversation, me, size = 46 }: { conversation: ChatConversation; me: string; size?: number }) {
  if (conversation.kind === 'group') return <Avatar name={conversation.name || 'Group'} group size={size} />;
  const peer = directPeer(conversation, me);
  return <Avatar name={peer?.empName || '?'} appRole={peer?.appRole} size={size} />;
}

// ─── Media ────────────────────────────────────────────────────────────────────

function MediaContent({
  message, isMine, colors, onViewImage, onOpenFile, onLongPress,
}: {
  message: ChatMessage; isMine: boolean; colors: Colors;
  onViewImage: (image: ViewingImage) => void;
  onOpenFile: (message: ChatMessage) => void;
  onLongPress: () => void;
}) {
  const media = message.media;
  const imageSource = useStoredFileSource(media?.mimeType?.startsWith('image/') ? media : null);
  if (!media) return null;
  const isImage = media.mimeType?.startsWith('image/');
  const isVideo = media.mimeType?.startsWith('video/');
  const icon = mediaIcon(media.mimeType || '');

  if (isImage) {
    return (
      <Pressable
        disabled={!imageSource}
        onPress={() => imageSource && onViewImage({ source: imageSource, file: media })}
        onLongPress={onLongPress}
        accessibilityLabel={`Open photo ${media.name}`}
      >
        {imageSource ? (
          <Image source={imageSource} style={styles.mediaImage} resizeMode="cover" />
        ) : (
          <View style={[styles.mediaImage, styles.mediaPlaceholder]}>
            <ActivityIndicator size="small" color={isMine ? '#fff' : colors.textSubtle} />
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => onOpenFile(message)}
      onLongPress={onLongPress}
      accessibilityLabel={`Open file ${media.name}`}
      style={[styles.fileCard, { backgroundColor: isMine ? 'rgba(255,255,255,0.14)' : colors.background }]}
    >
      <View style={[styles.fileIconBox, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : icon.color + '18' }]}>
        <Ionicons name={icon.name as never} size={22} color={isMine ? '#fff' : icon.color} />
        {isVideo && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={8} color="#fff" />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.fileName, { color: isMine ? '#fff' : colors.text }]} numberOfLines={2}>{media.name}</Text>
        <Text style={[styles.fileMeta, { color: isMine ? 'rgba(255,255,255,0.7)' : colors.textSubtle }]}>
          {isVideo ? 'Video' : media.mimeType === 'application/pdf' ? 'PDF' : 'File'}
          {media.size ? ` · ${formatBytes(media.size)}` : ''} · tap to preview
        </Text>
      </View>
    </Pressable>
  );
}

function ImageViewerModal({ image, onClose }: { image: ViewingImage; onClose: () => void }) {
  const [busy, setBusy] = useState<'download' | 'export' | 'print' | null>(null);

  async function run(action: 'download' | 'export' | 'print') {
    setBusy(action);
    try {
      if (action === 'download') {
        const result = await downloadStoredFile(image.file);
        if (result === 'done' && Platform.OS === 'android') Alert.alert('Downloaded', `${image.file.name} was saved.`);
      } else if (action === 'export') {
        await exportStoredFile(image.file);
      } else {
        await printStoredFile(image.file);
      }
    } catch (error) {
      notify('Action failed', error instanceof Error && error.message ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.imgViewerBg} onPress={onClose}>
        <TouchableOpacity style={styles.imgViewerClose} onPress={onClose} activeOpacity={0.8} accessibilityLabel="Close photo">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Pressable onPress={() => undefined}>
          <Image source={image.source} style={styles.imgViewerImg} resizeMode="contain" />
        </Pressable>
        <View style={styles.imgViewerActions}>
          {([
            ['download', 'download-outline', 'Download'],
            ['export', 'share-outline', 'Export'],
            ['print', 'print-outline', 'Print'],
          ] as const).map(([action, icon, label]) => (
            <TouchableOpacity
              key={action}
              onPress={() => void run(action)}
              disabled={!!busy}
              accessibilityLabel={`${label} ${image.file.name}`}
              style={[styles.imgViewerAction, { opacity: busy && busy !== action ? 0.5 : 1 }]}
            >
              {busy === action
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name={icon} size={18} color="#fff" />}
              <Text style={styles.imgViewerActionText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.imgViewerHint}>Tap outside to close</Text>
      </Pressable>
    </Modal>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message, me, isGroup, accent, colors, highlighted,
  onActions, onToggleReaction, onViewImage, onOpenFile,
}: {
  message: ChatMessage; me: string; isGroup: boolean; accent: string; colors: Colors; highlighted: boolean;
  onActions: (message: ChatMessage) => void;
  onToggleReaction: (message: ChatMessage, emoji: string) => void;
  onViewImage: (image: ViewingImage) => void;
  onOpenFile: (message: ChatMessage) => void;
}) {
  if (message.kind === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={[styles.systemText, { backgroundColor: colors.surface, color: colors.textMuted, borderColor: colors.border }]}>
          {message.body}
        </Text>
      </View>
    );
  }

  const isMine = message.sender === me;
  const textColor = isMine ? '#fff' : colors.text;
  const subtleColor = isMine ? 'rgba(255,255,255,0.72)' : colors.textSubtle;
  const allSeen = message.recipientCount > 0 && message.seenCount >= message.recipientCount;
  const reply = message.replyTo;
  const openActions = () => onActions(message);

  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isMine && isGroup && (
        <View style={{ marginRight: 6, marginTop: 2 }}>
          <Avatar name={message.senderName} size={28} />
        </View>
      )}
      <View style={{ maxWidth: '100%', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
        <Pressable
          onPress={message.media && !message.deleted ? undefined : openActions}
          onLongPress={openActions}
          delayLongPress={300}
          accessibilityLabel={`Message from ${isMine ? 'you' : message.senderName}`}
          style={[
            styles.bubble,
            isMine
              ? { backgroundColor: accent, borderBottomRightRadius: 5 }
              : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 5 },
            highlighted && styles.bubbleHighlighted,
          ]}
        >
          {!isMine && isGroup && (
            <Text style={[styles.senderName, { color: accent }]} numberOfLines={1}>{message.senderName}</Text>
          )}
          {message.forwarded && !message.deleted && (
            <View style={styles.metaLine}>
              <Ionicons name="arrow-redo" size={11} color={subtleColor} />
              <Text style={[styles.metaLineText, { color: subtleColor }]}>Forwarded</Text>
            </View>
          )}
          {reply && !message.deleted && (
            <View style={[styles.replyQuote, { backgroundColor: isMine ? 'rgba(0,0,0,0.16)' : colors.background, borderLeftColor: isMine ? '#fff' : accent }]}>
              <Text style={[styles.replyQuoteName, { color: isMine ? '#fff' : accent }]} numberOfLines={1}>
                {reply.sender === me ? 'You' : reply.senderName}
              </Text>
              <Text style={[styles.replyQuoteText, { color: subtleColor }]} numberOfLines={2}>
                {reply.deleted ? 'This message was deleted' : reply.body || mediaLabel(reply.media)}
              </Text>
            </View>
          )}
          {message.deleted ? (
            <View style={styles.metaLine}>
              <Ionicons name="ban-outline" size={14} color={subtleColor} />
              <Text style={[styles.deletedText, { color: subtleColor }]}>
                {isMine ? 'You deleted this message' : 'This message was deleted'}
              </Text>
            </View>
          ) : (
            <>
              {message.media && (
                <MediaContent
                  message={message} isMine={isMine} colors={colors}
                  onViewImage={onViewImage} onOpenFile={onOpenFile} onLongPress={openActions}
                />
              )}
              {!!message.body && (
                <Text style={[styles.bubbleText, { color: textColor }, message.media && { marginTop: 6 }]}>{message.body}</Text>
              )}
            </>
          )}
          <View style={styles.bubbleFooter}>
            {message.pinnedAt && !message.deleted && <Ionicons name="pin" size={11} color={subtleColor} />}
            {message.editedAt && !message.deleted && <Text style={[styles.bubbleTime, { color: subtleColor }]}>edited ·</Text>}
            <Text style={[styles.bubbleTime, { color: subtleColor }]}>{clockTime(message.createdAt)}</Text>
            {isMine && !message.deleted && (
              <Ionicons
                name={message.seenCount > 0 ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={allSeen ? '#9ee7ff' : subtleColor}
                accessibilityLabel={allSeen ? 'Seen' : message.seenCount > 0 ? 'Seen by some' : 'Sent'}
              />
            )}
          </View>
        </Pressable>
        {message.reactions.length > 0 && !message.deleted && (
          <View style={[styles.reactionRow, isMine ? { justifyContent: 'flex-end' } : null]}>
            {message.reactions.map(reaction => {
              const mine = reaction.usernames.includes(me);
              return (
                <TouchableOpacity
                  key={reaction.emoji}
                  onPress={() => onToggleReaction(message, reaction.emoji)}
                  accessibilityLabel={`${reaction.emoji} reaction, ${reaction.usernames.length}`}
                  style={[styles.reactionChip, {
                    backgroundColor: mine ? accent + '22' : colors.surface,
                    borderColor: mine ? accent : colors.border,
                  }]}
                >
                  <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                  <Text style={[styles.reactionCount, { color: mine ? accent : colors.textMuted }]}>{reaction.usernames.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

function Sheet({
  visible, title, subtitle, onClose, colors, children, footer,
}: {
  visible: boolean; title: string; subtitle?: string; onClose: () => void; colors: Colors;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <View style={[styles.sheetGrip, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
                {!!subtitle && <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
              </View>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {children}
            {footer}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function SearchField({ value, onChange, placeholder, colors }: { value: string; onChange: (v: string) => void; placeholder: string; colors: Colors }) {
  return (
    <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Ionicons name="search" size={16} color={colors.textMuted} />
      <TextInput
        style={[styles.searchInput, { color: colors.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange('')} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function PersonRow({
  person, colors, accent, selected, onPress, trailing,
}: {
  person: Person; colors: Colors; accent: string; selected?: boolean; onPress?: () => void; trailing?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.pickerRow, { borderBottomColor: colors.border, backgroundColor: selected ? accent + '12' : 'transparent' }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={person.empName}
    >
      <Avatar name={person.empName} appRole={person.appRole} size={38} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[styles.contactName, { color: colors.text }]}>{person.empName}</Text>
        <Text style={[styles.contactSub, { color: colors.textMuted }]} numberOfLines={1}>
          {person.subtitle ?? roleLabelOf(person.appRole)}
        </Text>
      </View>
      {trailing ?? (selected === undefined
        ? <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        : <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? accent : colors.textSubtle} />)}
    </TouchableOpacity>
  );
}

function filterPeople(people: Person[], query: string): Person[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  return people.filter(person =>
    person.empName.toLowerCase().includes(q)
    || person.username.toLowerCase().includes(q)
    || roleLabelOf(person.appRole).toLowerCase().includes(q)
    || (person.subtitle ?? '').toLowerCase().includes(q));
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CommsScreen() {
  const { role, userName, accountUsername, userAccounts, refreshChatUnread } = useApp();
  const colors = useColors();
  const router = useRouter();
  const accent = ROLE_COLORS[role || 'admin'] || colors.primary;
  const me = accountUsername;

  const staff = useMemo<Person[]>(() => userAccounts
    .filter(account => account.status === 'active' && account.username && account.username !== me)
    .map(account => ({
      username: account.username,
      empName: account.empName,
      appRole: account.role,
      subtitle: [account.jobTitle || roleLabelOf(account.role), account.branchName].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => a.empName.localeCompare(b.empName)), [me, userAccounts]);

  // ── Inbox ──
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [listError, setListError] = useState('');
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('active');
  const [inboxQuery, setInboxQuery] = useState('');

  // ── Open conversation ──
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const stickToBottom = useRef(true);
  const activeIdRef = useRef<number | null>(null);
  const lastMarkedRef = useRef(0);

  // ── Sheets ──
  const [viewingImage, setViewingImage] = useState<ViewingImage | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [infoFor, setInfoFor] = useState<{ message: ChatMessage; info: ChatMessageInfo | null } | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [renameDraft, setRenameDraft] = useState('');
  const [threadQuery, setThreadQuery] = useState('');
  const [threadResults, setThreadResults] = useState<ChatMessage[] | null>(null);
  const [busy, setBusy] = useState(false);

  const active = conversations.find(conversation => conversation.id === activeId) ?? null;
  const isGroup = active?.kind === 'group';
  const amAdmin = active?.myRole === 'admin';

  // ── Loading ──
  const loadConversations = useCallback(async () => {
    const result = await chatApi.conversations();
    if (!result) {
      setListError('Chats could not be loaded. Check your connection.');
      setListLoaded(true);
      return;
    }
    setListError('');
    setConversations(result.conversations);
    setListLoaded(true);
  }, []);

  const markReadIfNeeded = useCallback(async (conversationId: number, latest: ChatMessage[]) => {
    const incoming = latest.filter(message => message.sender && message.sender !== me);
    const newest = incoming.length ? incoming[incoming.length - 1].id : 0;
    if (!newest || newest <= lastMarkedRef.current) return;
    lastMarkedRef.current = newest;
    await chatApi.markRead(conversationId);
    setConversations(current => current.map(conversation => conversation.id === conversationId
      ? { ...conversation, unread: 0, lastReadMessageId: Math.max(conversation.lastReadMessageId, newest) }
      : conversation));
    void refreshChatUnread();
  }, [me, refreshChatUnread]);

  const loadLatest = useCallback(async (conversationId: number) => {
    const [page, pins] = await Promise.all([
      chatApi.messages(conversationId, { limit: PAGE_SIZE }),
      chatApi.pinned(conversationId),
    ]);
    if (activeIdRef.current !== conversationId) return;
    if (page) {
      setMessages(previous => mergeLatest(previous, page.messages, page.hasMore));
      setHasMore(current => (page.messages.length === 0 ? page.hasMore : current || page.hasMore));
      void markReadIfNeeded(conversationId, page.messages);
    }
    if (pins) setPinned(pins.messages);
  }, [markReadIfNeeded]);

  useEffect(() => {
    void loadConversations();
    const unsubscribe = subscribeChatChanges(conversationId => {
      void loadConversations();
      const current = activeIdRef.current;
      if (current && (conversationId === null || conversationId === current)) void loadLatest(current);
    });
    const stopTimer = startForegroundTimer({
      delayMs: 20_000,
      callback: async () => {
        await loadConversations();
        if (activeIdRef.current) await loadLatest(activeIdRef.current);
      },
      runOnResume: true,
    });
    return () => {
      unsubscribe();
      stopTimer();
    };
  }, [loadConversations, loadLatest]);

  const openConversation = useCallback(async (conversation: ChatConversation) => {
    activeIdRef.current = conversation.id;
    lastMarkedRef.current = 0;
    stickToBottom.current = true;
    setConversations(current => current.some(c => c.id === conversation.id)
      ? current.map(c => (c.id === conversation.id ? { ...conversation, unread: c.unread } : c))
      : [conversation, ...current]);
    setActiveId(conversation.id);
    setMessages([]);
    setPinned([]);
    setHasMore(false);
    setDraft('');
    setReplyTo(null);
    setEditing(null);
    setShowSearch(false);
    setThreadQuery('');
    setThreadResults(null);
    setLoadingThread(true);
    try {
      const page = await chatApi.messages(conversation.id, { limit: PAGE_SIZE });
      if (activeIdRef.current !== conversation.id) return;
      if (!page) {
        notify('Chat unavailable', 'Messages could not be loaded. Please try again.');
        return;
      }
      setMessages(page.messages);
      setHasMore(page.hasMore);
      void markReadIfNeeded(conversation.id, page.messages);
      const pins = await chatApi.pinned(conversation.id);
      if (pins && activeIdRef.current === conversation.id) setPinned(pins.messages);
    } finally {
      if (activeIdRef.current === conversation.id) setLoadingThread(false);
    }
  }, [markReadIfNeeded]);

  function closeConversation() {
    activeIdRef.current = null;
    setActiveId(null);
    setMessages([]);
    setShowGroupInfo(false);
    void loadConversations();
  }

  async function loadOlder() {
    if (!activeId || loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    stickToBottom.current = false;
    try {
      const page = await chatApi.messages(activeId, { before: messages[0].id, limit: PAGE_SIZE });
      if (!page || activeIdRef.current !== activeId) return;
      setMessages(current => [...page.messages.filter(m => !current.some(c => c.id === m.id)), ...current]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  function upsertMessage(message: ChatMessage) {
    setMessages(current => current.some(m => m.id === message.id)
      ? current.map(m => (m.id === message.id ? message : m))
      : [...current, message]);
  }

  function failed(result: { error?: string } | null, fallback: string): boolean {
    if (result && !result.error) return false;
    notify('Something went wrong', result?.error || fallback);
    return true;
  }

  // ── Starting chats ──
  async function startDirect(person: Person) {
    setBusy(true);
    try {
      const result = await chatApi.openDirect(person.username);
      if (failed(result, 'The chat could not be opened.') || !result) return;
      setShowNewChat(false);
      setPickerQuery('');
      void openConversation(result.conversation);
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name) return notify('Group name required', 'Give the group a name.');
    if (selected.length === 0) return notify('Add members', 'Choose at least one staff member.');
    setBusy(true);
    try {
      const result = await chatApi.createGroup(name, selected);
      if (failed(result, 'The group could not be created.') || !result) return;
      setShowCreateGroup(false);
      setGroupName('');
      setSelected([]);
      setPickerQuery('');
      void openConversation(result.conversation);
    } finally {
      setBusy(false);
    }
  }

  // ── Sending ──
  async function send() {
    if (!activeId || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      if (editing) {
        if (body === editing.body) {
          setEditing(null);
          setDraft('');
          return;
        }
        const result = await chatApi.edit(editing.id, body);
        if (failed(result, 'The message could not be edited.') || !result) return;
        upsertMessage(result.message);
        setEditing(null);
        setDraft('');
        return;
      }
      const result = await chatApi.send(activeId, { body, replyToId: replyTo?.id });
      if (failed(result, 'The message was not sent. Please try again.') || !result) return;
      stickToBottom.current = true;
      upsertMessage(result.message);
      setDraft('');
      setReplyTo(null);
      void loadConversations();
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(asset: UploadableFile & { mimeType: string }) {
    if (!activeId) return;
    if (asset.size != null && asset.size > MAX_UPLOAD_BYTES) {
      notify('File too large', `The maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    const conversationId = activeId;
    setUploading(true);
    try {
      const saved = await storageApi.uploadFile(asset, { category: 'chat_media', relatedId: String(conversationId) });
      const result = await chatApi.send(conversationId, {
        body: draft.trim() || undefined,
        replyToId: replyTo?.id,
        media: { objectPath: saved.objectPath, name: saved.name, mimeType: saved.mimeType, size: saved.size },
      });
      if (failed(result, 'The file was uploaded but the message was not sent.') || !result) return;
      stickToBottom.current = true;
      upsertMessage(result.message);
      setDraft('');
      setReplyTo(null);
      void loadConversations();
    } catch (error) {
      notify('Upload failed', uploadFailureMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function pickMedia(kind: 'images' | 'videos') {
    setShowAttach(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify('Permission required', 'Please allow photo and video access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], quality: 0.6 });
    if (result.canceled) return;
    const asset = result.assets[0];
    await sendAttachment({
      uri: asset.uri,
      file: asset.file ?? null,
      name: asset.fileName || (kind === 'images' ? 'photo.jpg' : 'video.mp4'),
      mimeType: asset.mimeType || (kind === 'images' ? 'image/jpeg' : 'video/mp4'),
      size: asset.fileSize ?? null,
    });
  }

  async function pickDocument() {
    setShowAttach(false);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const doc = result.assets[0];
    await sendAttachment({
      uri: doc.uri,
      file: doc.file ?? null,
      name: doc.name,
      mimeType: doc.mimeType || 'application/octet-stream',
      size: doc.size ?? null,
    });
  }

  function openFile(message: ChatMessage) {
    const media = message.media;
    if (!media || (!media.objectPath && !media.uri)) return;
    router.push(storedFilePreviewRoute(media, {
      context: `Chat file from ${message.senderName}`, uploadedBy: message.senderName, uploadedAt: message.createdAt,
    }) as never);
  }

  // ── Message actions ──
  async function toggleReaction(message: ChatMessage, emoji: string) {
    setActionMessage(null);
    const result = await chatApi.react(message.id, emoji);
    if (failed(result, 'The reaction could not be saved.') || !result) return;
    upsertMessage(result.message);
  }

  function startReply(message: ChatMessage) {
    setActionMessage(null);
    setEditing(null);
    setReplyTo(message);
  }

  function startEdit(message: ChatMessage) {
    setActionMessage(null);
    setReplyTo(null);
    setEditing(message);
    setDraft(message.body);
  }

  async function copyText(message: ChatMessage) {
    setActionMessage(null);
    const text = message.body || message.media?.name || '';
    if (!text) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to the share sheet.
      }
    }
    await Share.share({ message: text }).catch(() => undefined);
  }

  async function togglePin(message: ChatMessage) {
    setActionMessage(null);
    const result = await chatApi.pin(message.id, !message.pinnedAt);
    if (failed(result, 'The message could not be pinned.') || !result) return;
    upsertMessage(result.message);
    if (activeId) {
      const pins = await chatApi.pinned(activeId);
      if (pins) setPinned(pins.messages);
    }
  }

  async function deleteMessage(message: ChatMessage, scope: 'me' | 'everyone') {
    setActionMessage(null);
    const ok = await confirmAction(
      scope === 'everyone' ? 'Delete for everyone?' : 'Delete for me?',
      scope === 'everyone'
        ? 'Everyone in this chat will see "This message was deleted".'
        : 'The message is removed from your view only. Others can still see it.',
      'Delete',
      true,
    );
    if (!ok) return;
    const result = await chatApi.remove(message.id, scope);
    if (failed(result, 'The message could not be deleted.')) return;
    if (editing?.id === message.id) {
      setEditing(null);
      setDraft('');
    }
    if (scope === 'me') setMessages(current => current.filter(m => m.id !== message.id));
    else if (activeId) void loadLatest(activeId);
    setPinned(current => current.filter(m => m.id !== message.id));
    void loadConversations();
  }

  async function showInfo(message: ChatMessage) {
    setActionMessage(null);
    setInfoFor({ message, info: null });
    const info = await chatApi.info(message.id);
    setInfoFor(current => (current?.message.id === message.id ? { message, info } : current));
  }

  async function forwardTo(target: { conversationId?: number; person?: Person }) {
    if (!forwarding) return;
    setBusy(true);
    try {
      let conversationId = target.conversationId;
      if (!conversationId && target.person) {
        const opened = await chatApi.openDirect(target.person.username);
        if (failed(opened, 'The chat could not be opened.') || !opened) return;
        conversationId = opened.conversation.id;
      }
      if (!conversationId) return;
      const result = await chatApi.forward(forwarding.id, [conversationId]);
      if (failed(result, 'The message could not be forwarded.')) return;
      setForwarding(null);
      setPickerQuery('');
      void loadConversations();
      notify('Forwarded', 'The message was forwarded.');
    } finally {
      setBusy(false);
    }
  }

  async function runThreadSearch() {
    if (!activeId || !threadQuery.trim()) {
      setThreadResults(null);
      return;
    }
    const result = await chatApi.messages(activeId, { q: threadQuery.trim(), limit: 100 });
    setThreadResults(result ? [...result.messages].reverse() : []);
  }

  function jumpToMessage(message: ChatMessage) {
    setShowPinned(false);
    setShowSearch(false);
    setThreadResults(null);
    if (messages.some(m => m.id === message.id)) {
      setHighlightId(message.id);
      setTimeout(() => setHighlightId(null), 2500);
    } else {
      notify(clockTime(message.createdAt) ? `${dayLabel(message.createdAt)}, ${clockTime(message.createdAt)}` : 'Message',
        `${message.senderName}: ${message.body || mediaLabel(message.media)}\n\nScroll up and tap "Load earlier messages" to see it in context.`);
    }
  }

  // ── Archive & groups ──
  async function toggleArchive(conversation: ChatConversation) {
    const result = await chatApi.setArchived(conversation.id, !conversation.archived);
    if (failed(result, 'The chat could not be updated.')) return;
    setConversations(current => current.map(c => (c.id === conversation.id ? { ...c, archived: !c.archived } : c)));
    if (conversation.id === activeId) closeConversation();
  }

  function replaceConversation(conversation: ChatConversation) {
    setConversations(current => current.map(c => (c.id === conversation.id ? { ...conversation, unread: c.unread } : c)));
  }

  async function renameGroup() {
    if (!active || !renameDraft.trim() || renameDraft.trim() === active.name) return;
    setBusy(true);
    try {
      const result = await chatApi.renameGroup(active.id, renameDraft.trim());
      if (failed(result, 'The group could not be renamed.') || !result) return;
      replaceConversation(result.conversation);
      void loadLatest(active.id);
    } finally {
      setBusy(false);
    }
  }

  async function addMembers() {
    if (!active || selected.length === 0) return;
    setBusy(true);
    try {
      const result = await chatApi.addMembers(active.id, selected);
      if (failed(result, 'Members could not be added.') || !result) return;
      replaceConversation(result.conversation);
      setSelected([]);
      setPickerQuery('');
      setShowAddMembers(false);
      void loadLatest(active.id);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: ChatMember) {
    if (!active) return;
    const leaving = member.username === me;
    const ok = await confirmAction(
      leaving ? 'Leave group?' : `Remove ${member.empName}?`,
      leaving ? 'You will stop receiving messages from this group.' : `${member.empName} will no longer see new messages in this group.`,
      leaving ? 'Leave' : 'Remove',
      true,
    );
    if (!ok) return;
    const result = await chatApi.removeMember(active.id, member.username);
    if (failed(result, leaving ? 'You could not leave the group.' : 'The member could not be removed.')) return;
    if (leaving) {
      setShowGroupInfo(false);
      closeConversation();
      setConversations(current => current.filter(c => c.id !== active.id));
      return;
    }
    const refreshed = await chatApi.conversation(active.id);
    if (refreshed) replaceConversation(refreshed.conversation);
    void loadLatest(active.id);
  }

  async function toggleAdmin(member: ChatMember) {
    if (!active) return;
    const result = await chatApi.setMemberRole(active.id, member.username, member.role === 'admin' ? 'member' : 'admin');
    if (failed(result, 'The member role could not be changed.') || !result) return;
    replaceConversation(result.conversation);
  }

  // ── Derived lists ──
  const visibleConversations = useMemo(() => {
    const q = inboxQuery.trim().toLowerCase();
    return conversations
      .filter(conversation => (inboxFilter === 'archived' ? conversation.archived : !conversation.archived))
      .filter(conversation => {
        if (!q) return true;
        const title = conversationTitle(conversation, me).toLowerCase();
        const preview = (conversation.lastMessage?.body ?? '').toLowerCase();
        return title.includes(q) || preview.includes(q)
          || conversation.members.some(member => member.empName.toLowerCase().includes(q));
      });
  }, [conversations, inboxFilter, inboxQuery, me]);

  const archivedCount = conversations.filter(c => c.archived).length;
  const unreadTotal = conversations.filter(c => !c.archived).reduce((sum, c) => sum + c.unread, 0);
  const memberNames = new Set(active?.members.map(member => member.username) ?? []);
  const addablePeople = staff.filter(person => !memberNames.has(person.username));
  const forwardTargets = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const chats = conversations.filter(c => !q || conversationTitle(c, me).toLowerCase().includes(q));
    const directPeers = new Set(conversations.filter(c => c.kind === 'direct').map(c => directPeer(c, me)?.username));
    const people = filterPeople(staff.filter(person => !directPeers.has(person.username)), pickerQuery);
    return { chats, people };
  }, [conversations, me, pickerQuery, staff]);

  function toggleSelected(username: string) {
    setSelected(current => (current.includes(username) ? current.filter(u => u !== username) : [...current, username]));
  }

  // ── Sheets ──
  const actionIsMine = actionMessage?.sender === me;
  const actionItems: { key: string; icon: string; label: string; danger?: boolean; onPress: () => void }[] = actionMessage && !actionMessage.deleted ? [
    { key: 'reply', icon: 'arrow-undo-outline', label: 'Reply', onPress: () => startReply(actionMessage) },
    { key: 'forward', icon: 'arrow-redo-outline', label: 'Forward', onPress: () => { setActionMessage(null); setPickerQuery(''); setForwarding(actionMessage); } },
    ...(actionMessage.body || actionMessage.media ? [{ key: 'copy', icon: 'copy-outline', label: Platform.OS === 'web' ? 'Copy text' : 'Share text', onPress: () => void copyText(actionMessage) }] : []),
    { key: 'pin', icon: actionMessage.pinnedAt ? 'pin' : 'pin-outline', label: actionMessage.pinnedAt ? 'Unpin' : 'Pin to top', onPress: () => void togglePin(actionMessage) },
    ...(actionIsMine && actionMessage.kind === 'text' ? [{ key: 'edit', icon: 'create-outline', label: 'Edit', onPress: () => startEdit(actionMessage) }] : []),
    ...(actionIsMine ? [{ key: 'info', icon: 'information-circle-outline', label: 'Message info', onPress: () => void showInfo(actionMessage) }] : []),
    { key: 'delete-me', icon: 'trash-outline', label: 'Delete for me', danger: true, onPress: () => void deleteMessage(actionMessage, 'me') },
    ...(actionIsMine ? [{ key: 'delete-all', icon: 'trash', label: 'Delete for everyone', danger: true, onPress: () => void deleteMessage(actionMessage, 'everyone') }] : []),
  ] : actionMessage ? [
    { key: 'delete-me', icon: 'trash-outline', label: 'Remove from my view', danger: true, onPress: () => void deleteMessage(actionMessage, 'me') },
  ] : [];

  const sheets = (
    <>
      {viewingImage && <ImageViewerModal image={viewingImage} onClose={() => setViewingImage(null)} />}

      <Sheet
        visible={!!actionMessage}
        title={actionMessage?.deleted ? 'Deleted message' : 'Message'}
        subtitle={actionMessage ? `${actionMessage.sender === me ? 'You' : actionMessage.senderName} · ${dayLabel(actionMessage.createdAt)} ${clockTime(actionMessage.createdAt)}` : undefined}
        onClose={() => setActionMessage(null)}
        colors={colors}
      >
        {actionMessage && !actionMessage.deleted && (
          <View style={[styles.reactionPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {CHAT_REACTIONS.map(emoji => {
              const mine = actionMessage.reactions.some(r => r.emoji === emoji && r.usernames.includes(me));
              return (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => void toggleReaction(actionMessage, emoji)}
                  accessibilityLabel={`React ${emoji}`}
                  style={[styles.reactionPickerItem, mine && { backgroundColor: accent + '26' }]}
                >
                  <Text style={styles.reactionPickerEmoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={styles.actionGrid}>
          {actionItems.map(item => (
            <TouchableOpacity
              key={item.key}
              onPress={item.onPress}
              accessibilityLabel={item.label}
              style={[styles.actionItem, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.actionIcon, { backgroundColor: (item.danger ? colors.error : accent) + '16' }]}>
                <Ionicons name={item.icon as never} size={18} color={item.danger ? colors.error : accent} />
              </View>
              <Text style={[styles.actionLabel, { color: item.danger ? colors.error : colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={showNewChat}
        title="New chat"
        subtitle="Message any active staff member or start a group"
        onClose={() => { setShowNewChat(false); setPickerQuery(''); }}
        colors={colors}
      >
        <TouchableOpacity
          style={[styles.newGroupRow, { backgroundColor: accent + '12', borderColor: accent + '40' }]}
          onPress={() => { setShowNewChat(false); setPickerQuery(''); setSelected([]); setGroupName(''); setShowCreateGroup(true); }}
          accessibilityLabel="Create a new group"
        >
          <View style={[styles.newGroupIcon, { backgroundColor: accent }]}>
            <Ionicons name="people" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactName, { color: colors.text }]}>New group</Text>
            <Text style={[styles.contactSub, { color: colors.textMuted }]}>Chat with several colleagues at once</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={accent} />
        </TouchableOpacity>
        <SearchField value={pickerQuery} onChange={setPickerQuery} placeholder="Search staff by name, role or branch…" colors={colors} />
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
          {filterPeople(staff, pickerQuery).map(person => (
            <PersonRow key={person.username} person={person} colors={colors} accent={accent} onPress={busy ? undefined : () => void startDirect(person)} />
          ))}
          {filterPeople(staff, pickerQuery).length === 0 && (
            <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>No active staff match your search.</Text>
          )}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={showCreateGroup}
        title="Create group"
        subtitle={`${selected.length} member${selected.length === 1 ? '' : 's'} selected · you will be the group admin`}
        onClose={() => setShowCreateGroup(false)}
        colors={colors}
        footer={(
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: groupName.trim() && selected.length ? accent : colors.border }]}
            onPress={() => void createGroup()}
            disabled={busy || !groupName.trim() || selected.length === 0}
            accessibilityLabel="Create group"
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="people" size={16} color="#fff" />}
            <Text style={styles.primaryBtnText}>Create group</Text>
          </TouchableOpacity>
        )}
      >
        <TextInput
          style={[styles.textField, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Group name, e.g. Lekki Station Team"
          placeholderTextColor={colors.textSubtle}
          maxLength={80}
          accessibilityLabel="Group name"
        />
        <SearchField value={pickerQuery} onChange={setPickerQuery} placeholder="Search staff…" colors={colors} />
        <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
          {filterPeople(staff, pickerQuery).map(person => (
            <PersonRow
              key={person.username} person={person} colors={colors} accent={accent}
              selected={selected.includes(person.username)} onPress={() => toggleSelected(person.username)}
            />
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={showAddMembers}
        title="Add members"
        subtitle={`${selected.length} selected`}
        onClose={() => { setShowAddMembers(false); setSelected([]); setPickerQuery(''); }}
        colors={colors}
        footer={(
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: selected.length ? accent : colors.border }]}
            onPress={() => void addMembers()}
            disabled={busy || selected.length === 0}
            accessibilityLabel="Add selected members"
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Add to group</Text>
          </TouchableOpacity>
        )}
      >
        <SearchField value={pickerQuery} onChange={setPickerQuery} placeholder="Search staff…" colors={colors} />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {filterPeople(addablePeople, pickerQuery).map(person => (
            <PersonRow
              key={person.username} person={person} colors={colors} accent={accent}
              selected={selected.includes(person.username)} onPress={() => toggleSelected(person.username)}
            />
          ))}
          {addablePeople.length === 0 && (
            <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>Everyone is already in this group.</Text>
          )}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={showGroupInfo && !!active && isGroup}
        title={active?.name || 'Group'}
        subtitle={active ? `${active.members.length} members · created by ${active.members.find(m => m.username === active.createdBy)?.empName ?? active.createdBy}` : undefined}
        onClose={() => setShowGroupInfo(false)}
        colors={colors}
      >
        {active && (
          <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
            {amAdmin && (
              <View style={styles.renameRow}>
                <TextInput
                  style={[styles.textField, { flex: 1, marginBottom: 0, backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
                  value={renameDraft}
                  onChangeText={setRenameDraft}
                  placeholder="Group name"
                  placeholderTextColor={colors.textSubtle}
                  maxLength={80}
                  accessibilityLabel="Rename group"
                />
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: renameDraft.trim() && renameDraft.trim() !== active.name ? accent : colors.border }]}
                  onPress={() => void renameGroup()}
                  disabled={busy || !renameDraft.trim() || renameDraft.trim() === active.name}
                  accessibilityLabel="Save group name"
                >
                  <Text style={styles.primaryBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
            {amAdmin && (
              <TouchableOpacity
                style={[styles.newGroupRow, { backgroundColor: accent + '12', borderColor: accent + '40' }]}
                onPress={() => { setSelected([]); setPickerQuery(''); setShowAddMembers(true); }}
                accessibilityLabel="Add members"
              >
                <View style={[styles.newGroupIcon, { backgroundColor: accent }]}>
                  <Ionicons name="person-add" size={16} color="#fff" />
                </View>
                <Text style={[styles.contactName, { color: colors.text, flex: 1 }]}>Add members</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MEMBERS</Text>
            {active.members.map(member => (
              <PersonRow
                key={member.username}
                person={{ username: member.username, empName: member.username === me ? `${member.empName} (You)` : member.empName, appRole: member.appRole }}
                colors={colors}
                accent={accent}
                trailing={(
                  <View style={styles.memberActions}>
                    {member.role === 'admin' && (
                      <Text style={[styles.adminBadge, { color: accent, borderColor: accent }]}>Admin</Text>
                    )}
                    {amAdmin && member.username !== me && (
                      <>
                        <TouchableOpacity
                          onPress={() => void toggleAdmin(member)}
                          accessibilityLabel={member.role === 'admin' ? `Remove admin from ${member.empName}` : `Make ${member.empName} admin`}
                          style={[styles.iconBtn, { backgroundColor: colors.background }]}
                        >
                          <Ionicons name={member.role === 'admin' ? 'shield' : 'shield-outline'} size={15} color={accent} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void removeMember(member)}
                          accessibilityLabel={`Remove ${member.empName}`}
                          style={[styles.iconBtn, { backgroundColor: colors.background }]}
                        >
                          <Ionicons name="person-remove-outline" size={15} color={colors.error} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              />
            ))}
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: colors.error }]}
              onPress={() => {
                const self = active.members.find(m => m.username === me);
                if (self) void removeMember(self);
              }}
              accessibilityLabel="Leave group"
            >
              <Ionicons name="exit-outline" size={16} color={colors.error} />
              <Text style={[styles.dangerBtnText, { color: colors.error }]}>Leave group</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Sheet>

      <Sheet
        visible={!!forwarding}
        title="Forward to…"
        subtitle={forwarding ? (forwarding.body || mediaLabel(forwarding.media)).slice(0, 80) : undefined}
        onClose={() => { setForwarding(null); setPickerQuery(''); }}
        colors={colors}
      >
        <SearchField value={pickerQuery} onChange={setPickerQuery} placeholder="Search chats and staff…" colors={colors} />
        <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
          {forwardTargets.chats.length > 0 && <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RECENT CHATS</Text>}
          {forwardTargets.chats.map(conversation => (
            <TouchableOpacity
              key={`c${conversation.id}`}
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={busy ? undefined : () => void forwardTo({ conversationId: conversation.id })}
              accessibilityLabel={`Forward to ${conversationTitle(conversation, me)}`}
            >
              <ConversationAvatar conversation={conversation} me={me} size={38} />
              <Text style={[styles.contactName, { color: colors.text, flex: 1, marginLeft: 10 }]}>{conversationTitle(conversation, me)}</Text>
              <Ionicons name="send" size={15} color={accent} />
            </TouchableOpacity>
          ))}
          {forwardTargets.people.length > 0 && <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>OTHER STAFF</Text>}
          {forwardTargets.people.map(person => (
            <PersonRow
              key={`p${person.username}`} person={person} colors={colors} accent={accent}
              onPress={busy ? undefined : () => void forwardTo({ person })}
              trailing={<Ionicons name="send" size={15} color={accent} />}
            />
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={!!infoFor}
        title="Message info"
        subtitle={infoFor ? (infoFor.message.body || mediaLabel(infoFor.message.media)).slice(0, 90) : undefined}
        onClose={() => setInfoFor(null)}
        colors={colors}
      >
        {!infoFor?.info ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={accent} />
        ) : (
          <ScrollView style={{ maxHeight: 400 }}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              <Ionicons name="checkmark-done" size={12} color="#2b9bd6" /> SEEN BY ({infoFor.info.seenBy.length})
            </Text>
            {infoFor.info.seenBy.map(person => (
              <PersonRow
                key={person.username}
                person={{ username: person.username, empName: person.empName, appRole: null, subtitle: person.readAt ? `${dayLabel(person.readAt)}, ${clockTime(person.readAt)}` : 'Seen' }}
                colors={colors} accent={accent} trailing={<View />}
              />
            ))}
            {infoFor.info.seenBy.length === 0 && <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>Not seen yet.</Text>}
            {infoFor.info.notSeenBy.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DELIVERED, NOT SEEN ({infoFor.info.notSeenBy.length})</Text>
            )}
            {infoFor.info.notSeenBy.map(person => (
              <PersonRow
                key={person.username}
                person={{ username: person.username, empName: person.empName, appRole: null, subtitle: 'Not seen yet' }}
                colors={colors} accent={accent} trailing={<View />}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>

      <Sheet
        visible={showPinned}
        title="Pinned messages"
        subtitle={`${pinned.length} pinned`}
        onClose={() => setShowPinned(false)}
        colors={colors}
      >
        <ScrollView style={{ maxHeight: 420 }}>
          {pinned.map(message => (
            <View key={message.id} style={[styles.resultRow, { borderBottomColor: colors.border }]}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => jumpToMessage(message)}>
                <Text style={[styles.contactName, { color: colors.text }]}>{message.sender === me ? 'You' : message.senderName}</Text>
                <Text style={[styles.contactSub, { color: colors.textMuted }]} numberOfLines={2}>{message.body || mediaLabel(message.media)}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void togglePin(message)} accessibilityLabel="Unpin message" style={[styles.iconBtn, { backgroundColor: colors.background }]}>
                <Ionicons name="close" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          {pinned.length === 0 && <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>No pinned messages.</Text>}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={showSearch}
        title="Search this chat"
        onClose={() => { setShowSearch(false); setThreadResults(null); }}
        colors={colors}
      >
        <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={threadQuery}
            onChangeText={setThreadQuery}
            onSubmitEditing={() => void runThreadSearch()}
            placeholder="Search messages and file names…"
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity onPress={() => void runThreadSearch()} accessibilityLabel="Run search">
            <Ionicons name="arrow-forward-circle" size={22} color={accent} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 380 }}>
          {threadResults?.map(message => (
            <TouchableOpacity key={message.id} style={[styles.resultRow, { borderBottomColor: colors.border }]} onPress={() => jumpToMessage(message)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactName, { color: colors.text }]}>
                  {message.sender === me ? 'You' : message.senderName}
                  <Text style={[styles.contactSub, { color: colors.textSubtle }]}>{`  ${listTime(message.createdAt)}`}</Text>
                </Text>
                <Text style={[styles.contactSub, { color: colors.textMuted }]} numberOfLines={2}>{message.body || mediaLabel(message.media)}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {threadResults && threadResults.length === 0 && (
            <Text style={[styles.sheetEmpty, { color: colors.textMuted }]}>No messages found.</Text>
          )}
        </ScrollView>
      </Sheet>

      <Sheet visible={showAttach} title="Send attachment" subtitle="Photos, videos, PDFs and documents" onClose={() => setShowAttach(false)} colors={colors}>
        <View style={styles.attachGrid}>
          {([
            ['images', 'image', 'Photo', '#286247'],
            ['videos', 'videocam', 'Video', '#8e44ad'],
            ['document', 'document-text', 'Document', '#c0392b'],
          ] as const).map(([kind, icon, label, tint]) => (
            <TouchableOpacity
              key={kind}
              style={[styles.attachTile, { backgroundColor: tint + '14', borderColor: tint + '40' }]}
              onPress={() => void (kind === 'document' ? pickDocument() : pickMedia(kind))}
              accessibilityLabel={`Attach ${label}`}
            >
              <View style={[styles.attachTileIcon, { backgroundColor: tint }]}>
                <Ionicons name={icon} size={22} color="#fff" />
              </View>
              <Text style={[styles.attachTileText, { color: colors.text }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>
    </>
  );

  // ── Conversation view ──
  if (active) {
    const title = conversationTitle(active, me);
    const peer = !isGroup ? directPeer(active, me) : undefined;
    const subtitle = isGroup
      ? active.members.map(member => (member.username === me ? 'You' : member.empName.split(' ')[0])).join(', ')
      : peer ? roleLabelOf(peer.appRole) : '';
    const latestPin = pinned[0];
    const canSend = !!draft.trim() && !sending;
    let previousDay = '';

    return (
      <ScreenLayout title={title}>
        {sheets}
        <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={closeConversation} style={styles.backBtn} accessibilityLabel="Back to chats">
            <Ionicons name="chevron-back" size={24} color={accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chatHeaderMain}
            onPress={() => { if (isGroup) { setRenameDraft(active.name ?? ''); setShowGroupInfo(true); } }}
            disabled={!isGroup}
            accessibilityLabel={isGroup ? 'Group info' : title}
          >
            <ConversationAvatar conversation={active} me={me} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.chatHeaderName, { color: colors.text }]} numberOfLines={1}>{title}</Text>
              <Text style={[styles.chatHeaderSub, { color: colors.textMuted }]} numberOfLines={1}>
                {isGroup ? `${subtitle} · tap for info` : subtitle}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setThreadQuery(''); setThreadResults(null); setShowSearch(true); }} style={[styles.headerActionBtn, { backgroundColor: colors.background }]} accessibilityLabel="Search this chat">
            <Ionicons name="search" size={17} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void toggleArchive(active)} style={[styles.headerActionBtn, { backgroundColor: colors.background }]} accessibilityLabel={active.archived ? 'Unarchive chat' : 'Archive chat'}>
            <Ionicons name={active.archived ? 'archive' : 'archive-outline'} size={17} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {latestPin && (
          <TouchableOpacity
            style={[styles.pinBar, { backgroundColor: accent + '10', borderBottomColor: colors.border }]}
            onPress={() => setShowPinned(true)}
            accessibilityLabel="Show pinned messages"
          >
            <Ionicons name="pin" size={15} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pinBarTitle, { color: accent }]}>{pinned.length > 1 ? `${pinned.length} pinned messages` : 'Pinned message'}</Text>
              <Text style={[styles.pinBarText, { color: colors.text }]} numberOfLines={1}>{latestPin.body || mediaLabel(latestPin.media)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
          </TouchableOpacity>
        )}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={styles.chatScroll}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (stickToBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
            }}
            onScroll={event => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              stickToBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
            }}
            scrollEventThrottle={100}
          >
            {hasMore && (
              <TouchableOpacity
                style={[styles.loadOlderBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => void loadOlder()}
                disabled={loadingOlder}
                accessibilityLabel="Load earlier messages"
              >
                {loadingOlder ? <ActivityIndicator size="small" color={accent} /> : <Ionicons name="time-outline" size={14} color={accent} />}
                <Text style={[styles.loadOlderText, { color: accent }]}>Load earlier messages</Text>
              </TouchableOpacity>
            )}
            {loadingThread && messages.length === 0 ? (
              <ActivityIndicator style={{ marginTop: 60 }} color={accent} />
            ) : messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <View style={[styles.emptyIconCircle, { backgroundColor: accent + '14' }]}>
                  <Ionicons name={isGroup ? 'people-outline' : 'chatbubble-ellipses-outline'} size={36} color={accent} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>{isGroup ? 'Say hello to the group' : `Start chatting with ${title.split(' ')[0]}`}</Text>
                <Text style={[styles.emptyTextSub, { color: colors.textSubtle }]}>Use 📎 to send photos, videos, PDFs or documents.</Text>
              </View>
            ) : (
              messages.map(message => {
                const day = dayLabel(message.createdAt);
                const showDay = day !== previousDay;
                previousDay = day;
                return (
                  <React.Fragment key={message.id}>
                    {showDay && (
                      <View style={styles.dayRow}>
                        <Text style={[styles.dayText, { backgroundColor: colors.surface, color: colors.textMuted, borderColor: colors.border }]}>{day}</Text>
                      </View>
                    )}
                    <MessageBubble
                      message={message} me={me} isGroup={isGroup} accent={accent} colors={colors}
                      highlighted={highlightId === message.id}
                      onActions={setActionMessage}
                      onToggleReaction={(m, emoji) => void toggleReaction(m, emoji)}
                      onViewImage={setViewingImage}
                      onOpenFile={openFile}
                    />
                  </React.Fragment>
                );
              })
            )}
          </ScrollView>

          {(replyTo || editing) && (
            <View style={[styles.composerBanner, { backgroundColor: colors.surface, borderTopColor: colors.border, borderLeftColor: accent }]}>
              <Ionicons name={editing ? 'create-outline' : 'arrow-undo-outline'} size={16} color={accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: accent }]}>
                  {editing ? 'Editing message' : `Replying to ${replyTo?.sender === me ? 'yourself' : replyTo?.senderName}`}
                </Text>
                <Text style={[styles.bannerText, { color: colors.textMuted }]} numberOfLines={1}>
                  {(editing ?? replyTo)?.body || mediaLabel((editing ?? replyTo)?.media ?? null)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { if (editing) setDraft(''); setEditing(null); setReplyTo(null); }}
                accessibilityLabel={editing ? 'Cancel edit' : 'Cancel reply'}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {!editing && (
              <TouchableOpacity
                onPress={() => setShowAttach(true)}
                disabled={uploading}
                accessibilityLabel={uploading ? 'Uploading attachment' : 'Send attachment'}
                style={[styles.attachBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                {uploading ? <ActivityIndicator size="small" color={accent} /> : <Ionicons name="attach" size={21} color={colors.textMuted} />}
              </TouchableOpacity>
            )}
            <TextInput
              style={[styles.msgInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
              value={draft}
              onChangeText={setDraft}
              placeholder={editing ? 'Edit your message…' : 'Type a message…'}
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={4000}
              accessibilityLabel="Message"
              onKeyPress={event => {
                const native = event.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) {
                  (event as unknown as { preventDefault?: () => void }).preventDefault?.();
                  void send();
                }
              }}
            />
            <TouchableOpacity
              onPress={() => void send()}
              style={[styles.sendBtn, { backgroundColor: canSend ? accent : colors.border }]}
              disabled={!canSend}
              accessibilityLabel={editing ? 'Save edit' : 'Send message'}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={editing ? 'checkmark' : 'send'} size={17} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScreenLayout>
    );
  }

  // ── Inbox ──
  return (
    <ScreenLayout title="My Chats">
      {sheets}
      <ScrollView contentContainerStyle={styles.listScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: accent }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Team Chats</Text>
            <Text style={styles.heroSub}>
              {unreadTotal > 0 ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}` : 'You are all caught up'}
            </Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="chatbubbles" size={26} color="#fff" />
          </View>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: accent }]}
            onPress={() => { setPickerQuery(''); setShowNewChat(true); }}
            accessibilityLabel="New chat"
          >
            <Ionicons name="create-outline" size={17} color="#fff" />
            <Text style={styles.quickBtnText}>New chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: accent, borderWidth: 1.5 }]}
            onPress={() => { setPickerQuery(''); setSelected([]); setGroupName(''); setShowCreateGroup(true); }}
            accessibilityLabel="New group"
          >
            <Ionicons name="people-outline" size={17} color={accent} />
            <Text style={[styles.quickBtnText, { color: accent }]}>New group</Text>
          </TouchableOpacity>
        </View>

        <SearchField value={inboxQuery} onChange={setInboxQuery} placeholder="Search chats, groups and people…" colors={colors} />

        <View style={[styles.inboxFilter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {([
            { id: 'active' as InboxFilter, label: 'Chats', icon: 'chatbubbles-outline' },
            { id: 'archived' as InboxFilter, label: `Archived${archivedCount ? ` (${archivedCount})` : ''}`, icon: 'archive-outline' },
          ]).map(filter => (
            <TouchableOpacity
              key={filter.id}
              onPress={() => setInboxFilter(filter.id)}
              style={[styles.inboxFilterItem, inboxFilter === filter.id && { backgroundColor: accent }]}
              accessibilityLabel={filter.label}
            >
              <Ionicons name={filter.icon as never} size={14} color={inboxFilter === filter.id ? '#fff' : colors.textMuted} />
              <Text style={[styles.inboxFilterText, { color: inboxFilter === filter.id ? '#fff' : colors.textMuted }]}>{filter.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!listLoaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
        ) : listError ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={42} color={colors.textSubtle} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{listError}</Text>
            <TouchableOpacity onPress={() => void loadConversations()} style={[styles.smallBtn, { backgroundColor: accent }]}>
              <Text style={styles.primaryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : visibleConversations.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: accent + '14' }]}>
              <Ionicons name={inboxQuery ? 'search-outline' : inboxFilter === 'archived' ? 'archive-outline' : 'chatbubble-ellipses-outline'} size={34} color={accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {inboxQuery ? 'No matching chats' : inboxFilter === 'archived' ? 'No archived chats' : 'No chats yet'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {inboxQuery ? 'Try another name or word.' : inboxFilter === 'archived' ? 'Archived chats appear here.' : 'Tap "New chat" to message a colleague, or create a group.'}
            </Text>
          </View>
        ) : (
          visibleConversations.map(conversation => {
            const unread = conversation.unread;
            const last = conversation.lastMessage;
            return (
              <TouchableOpacity
                key={conversation.id}
                style={[styles.contactRow, { backgroundColor: colors.surface, borderColor: unread > 0 ? accent + '55' : colors.border }]}
                onPress={() => void openConversation(conversation)}
                accessibilityLabel={`Open chat ${conversationTitle(conversation, me)}`}
              >
                <View style={{ marginRight: 12 }}>
                  <ConversationAvatar conversation={conversation} me={me} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.contactName, { color: colors.text, flex: 1 }]} numberOfLines={1}>{conversationTitle(conversation, me)}</Text>
                    <Text style={[styles.conversationTime, { color: unread > 0 ? accent : colors.textSubtle }]}>{listTime(last?.createdAt ?? conversation.updatedAt)}</Text>
                  </View>
                  <View style={styles.rowTop}>
                    {conversation.kind === 'group' && (
                      <Text style={[styles.groupTag, { color: accent, backgroundColor: accent + '16' }]}>GROUP</Text>
                    )}
                    <Text
                      style={[styles.contactSub, { color: unread > 0 ? colors.text : colors.textMuted, fontWeight: unread > 0 ? '700' : '400', flex: 1 }]}
                      numberOfLines={1}
                    >
                      {messagePreview(last, me, conversation.kind === 'group')}
                    </Text>
                    {unread > 0 && (
                      <View style={[styles.unreadPill, { backgroundColor: accent }]}>
                        <Text style={styles.unreadPillText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => void toggleArchive(conversation)}
                  style={[styles.archiveIconBtn, { backgroundColor: colors.background }]}
                  accessibilityLabel={conversation.archived ? 'Unarchive chat' : 'Archive chat'}
                >
                  <Ionicons name={conversation.archived ? 'archive' : 'archive-outline'} size={15} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listScroll: { padding: 16, paddingBottom: 40 },

  hero:      { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 18, marginBottom: 14 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.2 },
  heroSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginTop: 3 },
  heroIcon:  { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },

  quickRow:     { flexDirection: 'row', gap: 10, marginBottom: 12 },
  quickBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 13 },
  quickBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  inboxFilter:     { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, marginBottom: 12 },
  inboxFilterItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 9 },
  inboxFilterText: { fontSize: 12, fontWeight: '800' },

  contactRow:       { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  rowTop:           { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactName:      { fontSize: 15, fontWeight: '800' },
  contactSub:       { fontSize: 12, marginTop: 1 },
  conversationTime: { fontSize: 11, fontWeight: '700' },
  groupTag:         { fontSize: 9, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', letterSpacing: 0.5 },
  unreadPill:       { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadPillText:   { color: '#fff', fontSize: 11, fontWeight: '900' },
  archiveIconBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingTop: 10, paddingBottom: 30, maxWidth: 720, width: '100%', alignSelf: 'center' },
  sheetGrip:     { width: 42, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  sheetHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetTitle:    { fontSize: 18, fontWeight: '900' },
  sheetSubtitle: { fontSize: 12, marginTop: 3 },
  sheetEmpty:    { textAlign: 'center', fontSize: 13, paddingVertical: 20 },
  sectionLabel:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 14, marginBottom: 4 },
  pickerRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 8 },
  resultRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  newGroupRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  newGroupIcon:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  textField:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginBottom: 12 },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 13, marginTop: 14 },
  primaryBtnText:{ color: '#fff', fontSize: 14, fontWeight: '800' },
  smallBtn:      { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dangerBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginTop: 18 },
  dangerBtnText: { fontSize: 14, fontWeight: '800' },
  renameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adminBadge:    { fontSize: 10, fontWeight: '800', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  iconBtn:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  reactionPicker:      { flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderRadius: 30, paddingHorizontal: 6, paddingVertical: 4, marginBottom: 10 },
  reactionPickerItem:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  reactionPickerEmoji: { fontSize: 22 },
  actionGrid:  { },
  actionItem:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  actionIcon:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 15, fontWeight: '700' },

  attachGrid:     { flexDirection: 'row', gap: 10 },
  attachTile:     { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 18, borderRadius: 16, borderWidth: 1 },
  attachTileIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  attachTileText: { fontSize: 13, fontWeight: '800' },

  chatHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chatHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:        { marginRight: 2 },
  chatHeaderName: { fontSize: 16, fontWeight: '800' },
  chatHeaderSub:  { fontSize: 11, marginTop: 1 },
  headerActionBtn:{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pinBar:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  pinBarTitle:    { fontSize: 11, fontWeight: '800' },
  pinBarText:     { fontSize: 13 },
  chatScroll:     { padding: 12, paddingBottom: 10 },
  loadOlderBtn:   { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  loadOlderText:  { fontSize: 12, fontWeight: '800' },
  dayRow:         { alignItems: 'center', marginVertical: 8 },
  dayText:        { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  systemRow:      { alignItems: 'center', marginVertical: 6 },
  systemText:     { fontSize: 11, fontStyle: 'italic', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, overflow: 'hidden', textAlign: 'center' },
  emptyChat:      { alignItems: 'center', marginTop: 60, gap: 10, paddingHorizontal: 20 },
  emptyIconCircle:{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTextSub:   { fontSize: 12, textAlign: 'center' },

  bubbleRow:         { flexDirection: 'row', marginBottom: 6, maxWidth: '84%' },
  bubbleLeft:        { alignSelf: 'flex-start' },
  bubbleRight:       { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble:            { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, minWidth: 72 },
  bubbleHighlighted: { borderWidth: 2, borderColor: '#f5b400' },
  senderName:        { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  bubbleText:        { fontSize: 15, lineHeight: 21 },
  bubbleFooter:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  bubbleTime:        { fontSize: 10 },
  metaLine:          { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  metaLineText:      { fontSize: 11, fontStyle: 'italic' },
  deletedText:       { fontSize: 14, fontStyle: 'italic' },
  replyQuote:        { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  replyQuoteName:    { fontSize: 12, fontWeight: '800' },
  replyQuoteText:    { fontSize: 12 },
  reactionRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, marginBottom: 4, paddingHorizontal: 6 },
  reactionChip:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  reactionEmoji:     { fontSize: 13 },
  reactionCount:     { fontSize: 11, fontWeight: '800' },

  mediaImage:       { width: 230, height: 180, borderRadius: 12 },
  mediaPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.08)' },
  fileCard:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, maxWidth: 260 },
  fileIconBox:      { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  playBadge:        { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  fileName:         { fontSize: 13, fontWeight: '700' },
  fileMeta:         { fontSize: 10 },

  imgViewerBg:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  imgViewerClose:      { position: 'absolute', top: 52, right: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  imgViewerImg:        { width: '100%', aspectRatio: 1 },
  imgViewerHint:       { position: 'absolute', bottom: 42, color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  imgViewerActions:    { position: 'absolute', bottom: 74, flexDirection: 'row', gap: 10 },
  imgViewerAction:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  imgViewerActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  composerBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: 4 },
  bannerTitle:    { fontSize: 12, fontWeight: '800' },
  bannerText:     { fontSize: 12 },
  inputBar:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  attachBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  msgInput:  { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  sendBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  emptyState: { alignItems: 'center', marginTop: 40, gap: 10, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyText:  { fontSize: 13, textAlign: 'center' },
});
