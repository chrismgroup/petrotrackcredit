import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
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
  ROLE_COLORS,
  Role,
  UINFO,
  useApp,
} from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Tab = 'chats' | 'broadcast' | 'calls';
type Colors = ReturnType<typeof useColors>;

const CAN_BROADCAST = ['admin', 'ceo', 'md', 'csm'];

const AUDIENCE_OPTS = [
  { value: 'all',       label: 'All Staff'        },
  { value: 'role:ceo',  label: 'CEO'              },
  { value: 'role:md',   label: 'MD'               },
  { value: 'role:acc',  label: 'Accountant'       },
  { value: 'role:csm',  label: 'CSM'              },
  { value: 'role:mktg', label: 'Marketing'        },
  { value: 'role:mgr',  label: 'Station Mgr'      },
  { value: 'role:att',  label: 'Pump Attendant'   },
];

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Module-scope sub-components ─────────────────────────────────────────────

function Avatar({ role, size = 40, colors }: { role: string; size?: number; colors: Colors }) {
  const info = UINFO[role];
  const color = info?.color || ROLE_COLORS[role] || colors.primary;
  const initials = info?.initials || role.slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: color + '44',
    }}>
      <Text style={{ fontSize: size * 0.32, fontWeight: '800', color }}>{initials}</Text>
    </View>
  );
}

function OnlineDot({ online, colors }: { online: boolean; colors: Colors }) {
  return (
    <View style={{
      position: 'absolute', bottom: 0, right: 0,
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: online ? '#27ae60' : colors.border,
      borderWidth: 1.5, borderColor: colors.surface,
    }} />
  );
}

function CallOverlay({
  peer, callState, duration, pulse, onEnd, onDecline, colors,
}: {
  peer: Role;
  callState: 'ringing' | 'connected';
  duration: number;
  pulse: Animated.Value;
  onEnd: () => void;
  onDecline: () => void;
  colors: Colors;
}) {
  const info = UINFO[peer];
  const peerColor = info?.color || '#1a6e3c';

  return (
    <View style={[styles.callOverlay, { backgroundColor: '#0d1f17' }]}>
      <View style={styles.callContent}>
        <Animated.View style={[styles.callAvatarWrap, { transform: [{ scale: pulse }], backgroundColor: peerColor + '22', borderColor: peerColor + '66' }]}>
          <Text style={[styles.callAvatarText, { color: peerColor }]}>{info?.initials || peer.slice(0, 2).toUpperCase()}</Text>
        </Animated.View>
        <Text style={styles.callingName}>{info?.name || peer}</Text>
        <Text style={styles.callingRole}>{info?.role}</Text>
        <Text style={styles.callStatusText}>
          {callState === 'ringing' ? 'Calling…' : fmtDuration(duration)}
        </Text>
      </View>

      <View style={styles.callControls}>
        {callState === 'ringing' ? (
          <TouchableOpacity style={[styles.callControlBtn, { backgroundColor: '#e74c3c' }]} onPress={onDecline}>
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            <Text style={styles.callControlLabel}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={[styles.callControlBtn, { backgroundColor: '#2c3e50' }]}>
              <Ionicons name="mic-off" size={24} color="#fff" />
              <Text style={styles.callControlLabel}>Mute</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.callControlBtn, { backgroundColor: '#e74c3c' }]} onPress={onEnd}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={styles.callControlLabel}>End</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.callControlBtn, { backgroundColor: '#2c3e50' }]}>
              <Ionicons name="volume-high" size={24} color="#fff" />
              <Text style={styles.callControlLabel}>Speaker</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CommsScreen() {
  const {
    role, userName,
    sendMessage, markRead, getConversation, unreadCount,
    broadcasts, addBroadcast,
    callLog, addCallRecord,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'admin'] || colors.primary;

  // All contactable peers (everyone except self)
  const peers = (Object.keys(UINFO) as Role[]).filter(r => r !== role);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('chats');

  // ── Direct message state ───────────────────────────────────────────────────
  const [chatPeer, setChatPeer] = useState<Role | null>(null);
  const [draft, setDraft] = useState('');
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Broadcast compose state ────────────────────────────────────────────────
  const [showCompose, setShowCompose] = useState(false);
  const [bTitle, setBTitle] = useState('');
  const [bBody, setBBody] = useState('');
  const [bAudience, setBAudience] = useState('all');

  // ── Call overlay state ─────────────────────────────────────────────────────
  const [callingPeer, setCallingPeer] = useState<Role | null>(null);
  const [callState, setCallState] = useState<'ringing' | 'connected' | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callPulse = useRef(new Animated.Value(1)).current;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function peerUnread(peer: Role) {
    return getConversation(peer).filter(m => m.to === role && !m.read).length;
  }

  function lastMsg(peer: Role) {
    const conv = getConversation(peer);
    if (!conv.length) return 'Tap to chat';
    const m = conv[conv.length - 1];
    return (m.from === role ? 'You: ' : '') + m.body;
  }

  function openChat(peer: Role) {
    setChatPeer(peer);
    markRead(peer);
  }

  function sendDM() {
    if (!chatPeer || !draft.trim()) return;
    sendMessage(chatPeer, { type: 'txt', body: draft.trim(), to: chatPeer });
    setDraft('');
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  function sendBroadcast() {
    if (!bTitle.trim() || !bBody.trim()) {
      Alert.alert('Required', 'Subject and message cannot be empty.');
      return;
    }
    const audienceLabel = AUDIENCE_OPTS.find(o => o.value === bAudience)?.label || 'All Staff';
    addBroadcast({
      from: role!,
      fromName: userName,
      title: bTitle.trim(),
      body: bBody.trim(),
      audience: bAudience,
      audienceName: audienceLabel,
    });
    setBTitle(''); setBBody(''); setBAudience('all');
    setShowCompose(false);
    Alert.alert('Sent', `Broadcast delivered to ${audienceLabel}.`);
  }

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(callPulse, { toValue: 1.2, duration: 700, useNativeDriver: true }),
        Animated.timing(callPulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [callPulse]);

  const stopPulse = useCallback(() => {
    callPulse.stopAnimation();
    callPulse.setValue(1);
  }, [callPulse]);

  function initiateCall(peer: Role) {
    if (callState) return;
    setCallingPeer(peer);
    setCallState('ringing');
    setCallDuration(0);
    startPulse();
    // Simulate auto-answer after 3 s
    setTimeout(() => {
      setCallState('connected');
      stopPulse();
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    }, 3000);
  }

  function endCall(status: 'ended' | 'declined' = 'ended') {
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    stopPulse();
    if (callingPeer) {
      addCallRecord({
        from: role!, fromName: userName,
        to: callingPeer, toName: UINFO[callingPeer]?.name || callingPeer,
        status: callDuration === 0 ? 'missed' : status,
        duration: callDuration > 0 ? fmtDuration(callDuration) : undefined,
      });
    }
    setCallingPeer(null); setCallState(null); setCallDuration(0);
  }

  // ── Chat thread view ───────────────────────────────────────────────────────
  if (chatPeer) {
    const peerInfo = UINFO[chatPeer];
    const peerColor = peerInfo?.color || ROLE_COLORS[chatPeer] || colors.primary;
    const conv = getConversation(chatPeer);

    return (
      <ScreenLayout title={peerInfo?.name || chatPeer}>
        {/* Thread header */}
        <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => { markRead(chatPeer); setChatPeer(null); }} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={roleColor} />
          </TouchableOpacity>
          <View style={{ position: 'relative' }}>
            <Avatar role={chatPeer} size={36} colors={colors} />
            <OnlineDot online={peerInfo?.online ?? false} colors={colors} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.chatHeaderName, { color: colors.text }]}>{peerInfo?.name}</Text>
            <Text style={[styles.chatHeaderSub, { color: colors.textMuted }]}>
              {peerInfo?.role} · {peerInfo?.online ? 'Online' : 'Offline'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => initiateCall(chatPeer)}
            style={[styles.callBtn, { backgroundColor: '#27ae60' + '18' }]}
          >
            <Ionicons name="call" size={18} color="#27ae60" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
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
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No messages yet. Say hello!</Text>
              </View>
            ) : conv.map(msg => {
              const isMine = msg.from === role;
              return (
                <View key={msg.id} style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
                  {!isMine && (
                    <View style={{ marginRight: 6, marginTop: 2 }}>
                      <Avatar role={chatPeer} size={26} colors={colors} />
                    </View>
                  )}
                  <View style={[
                    styles.bubble,
                    isMine
                      ? { backgroundColor: peerColor, borderBottomRightRadius: 4 }
                      : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
                  ]}>
                    <Text style={[styles.bubbleText, { color: isMine ? '#fff' : colors.text }]}>{msg.body}</Text>
                    <Text style={[styles.bubbleTime, { color: isMine ? 'rgba(255,255,255,0.6)' : colors.textSubtle }]}>{msg.ts}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.msgInput, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={sendDM}
            />
            <TouchableOpacity
              onPress={sendDM}
              style={[styles.sendBtn, { backgroundColor: draft.trim() ? roleColor : colors.border }]}
              disabled={!draft.trim()}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {callState && callingPeer && (
          <CallOverlay
            peer={callingPeer}
            callState={callState}
            duration={callDuration}
            pulse={callPulse}
            onEnd={() => endCall('ended')}
            onDecline={() => endCall('declined')}
            colors={colors}
          />
        )}
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
          { id: 'chats' as Tab,     label: 'Direct',    icon: 'chatbubbles',   badge: totalUnread },
          { id: 'broadcast' as Tab, label: 'Broadcast', icon: 'megaphone',     badge: 0 },
          { id: 'calls' as Tab,     label: 'Calls',     icon: 'call',          badge: 0 },
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
            <Text style={[styles.tabLabel, { color: activeTab === t.id ? roleColor : colors.textMuted, fontWeight: activeTab === t.id ? '700' : '500' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Direct Messages tab ── */}
      {activeTab === 'chats' && (
        <ScrollView contentContainerStyle={styles.listScroll} showsVerticalScrollIndicator={false}>
          {peers.map(peer => {
            const info = UINFO[peer];
            const unread = peerUnread(peer);
            return (
              <TouchableOpacity
                key={peer}
                style={[styles.contactRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openChat(peer)}
                activeOpacity={0.8}
              >
                <View style={{ position: 'relative', marginRight: 12 }}>
                  <Avatar role={peer} size={46} colors={colors} />
                  <OnlineDot online={info?.online ?? false} colors={colors} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactName, { color: colors.text }]}>{info?.name || peer}</Text>
                  <Text style={[styles.contactSub, { color: colors.textMuted }]} numberOfLines={1}>{lastMsg(peer)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {unread > 0 && (
                    <View style={[styles.unreadBadge, { backgroundColor: roleColor }]}>
                      <Text style={styles.unreadText}>{unread}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => initiateCall(peer)}
                    style={[styles.callIconBtn, { backgroundColor: '#27ae60' + '18' }]}
                  >
                    <Ionicons name="call-outline" size={15} color="#27ae60" />
                  </TouchableOpacity>
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
                        { backgroundColor: bAudience === opt.value ? roleColor : colors.background, borderColor: bAudience === opt.value ? roleColor : colors.border },
                      ]}
                    >
                      <Text style={[styles.audienceChipText, { color: bAudience === opt.value ? '#fff' : colors.textMuted }]}>{opt.label}</Text>
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

              <TouchableOpacity style={[styles.sendBroadcastBtn, { backgroundColor: roleColor }]} onPress={sendBroadcast} activeOpacity={0.85}>
                <Ionicons name="send" size={14} color="#fff" />
                <Text style={styles.sendBroadcastText}>Send Broadcast</Text>
              </TouchableOpacity>
            </View>
          )}

          {broadcasts.length === 0 && !showCompose && (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Broadcasts Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Company-wide announcements will appear here.</Text>
            </View>
          )}

          {broadcasts.map(b => {
            const senderColor = UINFO[b.from]?.color || ROLE_COLORS[b.from] || colors.primary;
            return (
              <View key={b.id} style={[styles.broadcastCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.broadcastCardHeader}>
                  <Avatar role={b.from} size={36} colors={colors} />
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
                <Text style={[styles.broadcastBody, { color: colors.textMuted }]}>{b.body}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Calls tab ── */}
      {activeTab === 'calls' && (
        <ScrollView contentContainerStyle={styles.listScroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Contacts</Text>
          {peers.map(peer => {
            const info = UINFO[peer];
            return (
              <View key={peer} style={[styles.callContactRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ position: 'relative', marginRight: 12 }}>
                  <Avatar role={peer} size={42} colors={colors} />
                  <OnlineDot online={info?.online ?? false} colors={colors} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactName, { color: colors.text }]}>{info?.name || peer}</Text>
                  <Text style={[styles.contactSub, { color: colors.textMuted }]}>{info?.role}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => initiateCall(peer)}
                  style={[styles.callNowBtn, { backgroundColor: '#27ae60' }]}
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
              {callLog.slice(0, 25).map(c => {
                const isMine = c.from === role;
                const peerRole = isMine ? c.to : c.from;
                const peerName = isMine ? c.toName : c.fromName;
                const statusColor =
                  c.status === 'ended'    ? colors.success :
                  c.status === 'missed'   ? colors.error   :
                  colors.warning;
                return (
                  <View key={c.id} style={[styles.callLogRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Avatar role={peerRole} size={38} colors={colors} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.contactName, { color: colors.text }]}>{peerName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons
                          name={isMine ? 'arrow-up-outline' : 'arrow-down-outline'}
                          size={10}
                          color={colors.textMuted}
                        />
                        <Text style={[styles.contactSub, { color: statusColor }]}>{c.status}</Text>
                        {c.duration && <Text style={[styles.contactSub, { color: colors.textMuted }]}>· {c.duration}</Text>}
                      </View>
                    </View>
                    <Text style={[styles.callTime, { color: colors.textSubtle }]}>{c.ts.split('T')[0]}</Text>
                    <TouchableOpacity
                      onPress={() => initiateCall(peerRole)}
                      style={[styles.callIconBtn, { backgroundColor: '#27ae60' + '18' }]}
                    >
                      <Ionicons name="call-outline" size={15} color="#27ae60" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}

          {callLog.length === 0 && (
            <View style={[styles.emptyState, { marginTop: 16 }]}>
              <Ionicons name="call-outline" size={44} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Calls Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Tap Call next to any contact above.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Call overlay (accessible from all tabs) */}
      {callState && callingPeer && (
        <CallOverlay
          peer={callingPeer}
          callState={callState}
          duration={callDuration}
          pulse={callPulse}
          onEnd={() => endCall('ended')}
          onDecline={() => endCall('declined')}
          colors={colors}
        />
      )}
    </ScreenLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Tab bar
  tabBar:     { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13 },
  tabLabel:   { fontSize: 12 },
  tabBadge:   { position: 'absolute', top: -4, right: -6, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },

  // List
  listScroll: { padding: 16, paddingBottom: 32 },

  // Contact row (chats tab)
  contactRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  contactName: { fontSize: 14, fontWeight: '700' },
  contactSub:  { fontSize: 11, marginTop: 2 },
  unreadBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  unreadText:  { color: '#fff', fontSize: 10, fontWeight: '800' },
  callIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Chat thread
  chatHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:        { marginRight: 2 },
  chatHeaderName: { fontSize: 14, fontWeight: '700' },
  chatHeaderSub:  { fontSize: 11 },
  callBtn:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatScroll:     { padding: 14, paddingBottom: 8 },
  emptyChat:      { alignItems: 'center', marginTop: 70, gap: 12 },

  bubbleRow:   { flexDirection: 'row', marginBottom: 8, maxWidth: '82%' },
  bubbleLeft:  { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble:      { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText:  { fontSize: 14, lineHeight: 20 },
  bubbleTime:  { fontSize: 10, marginTop: 4, textAlign: 'right' },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  msgInput: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 14, maxHeight: 110 },
  sendBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Broadcast
  composeBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 14 },
  composeBtnText:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  composeCard:      { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  composeCardHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  composeTitle:     { flex: 1, fontSize: 14, fontWeight: '700' },
  fieldLabel:       { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  composeInput:     { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  composeBodyInput: { height: 110, textAlignVertical: 'top' },
  sendBroadcastBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 10, marginTop: 4 },
  sendBroadcastText:{ color: '#fff', fontSize: 14, fontWeight: '700' },
  audienceChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  audienceChipText: { fontSize: 11, fontWeight: '600' },
  audienceTag:      { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },

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

  // Call overlay
  callOverlay:    { ...StyleSheet.absoluteFillObject, zIndex: 999, justifyContent: 'space-between', padding: 40, paddingBottom: 70 },
  callContent:    { alignItems: 'center', marginTop: 60, gap: 12 },
  callAvatarWrap: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  callAvatarText: { fontSize: 40, fontWeight: '800' },
  callingName:    { color: '#fff', fontSize: 26, fontWeight: '800' },
  callingRole:    { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  callStatusText: { color: 'rgba(255,255,255,0.75)', fontSize: 20, fontWeight: '600', marginTop: 8 },
  callControls:   { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  callControlBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', gap: 5 },
  callControlLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
});
