import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ROLE_COLORS, ROLE_LABELS, UINFO, useApp, type Role } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const QUICK_CHIPS: Record<string, string[]> = {
  admin: ['All systems OK', 'Noted', 'Access granted', 'Reviewing now'],
  ceo: ['Approved ✅', 'Noted', 'Please proceed', 'Escalate to board'],
  md: ['Approved ✅', 'Prices updated', 'Noted', 'Please document'],
  mktg: ['Filing today', 'Noted', 'Campaign active'],
  csm: ['Filing today', 'Noted', 'Renewals on track'],
  acc: ['Approved ✅', 'Logged in books', 'Noted', 'Receipt needed'],
  mgr: ['Dip done ✓', 'Noted', 'Will action now', 'Report filed'],
  att: ['Done sir/ma', 'Noted', 'Reporting issue'],
};

export default function ChatScreen() {
  const { peer } = useLocalSearchParams<{ peer: string }>();
  const { role, getConversation, markRead, sendMessage, userName } = useApp();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const peerRole = peer as Role;
  const peerInfo = UINFO[peerRole] || { name: peer, color: '#888', initials: '?' };
  const myColor = ROLE_COLORS[role || 'mgr'] || colors.primary;
  const chips = QUICK_CHIPS[role || 'att'] || ['Noted'];

  const [text, setText] = useState('');
  const [showReqModal, setShowReqModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [reqForm, setReqForm] = useState({ product: 'PMS', qty: '', sup: '', reason: '' });
  const [alertForm, setAlertForm] = useState({ title: '', pri: 'Urgent', detail: '' });

  const conversations = getConversation(peerRole);
  React.useEffect(() => { markRead(peerRole); }, [peerRole]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleSend() {
    if (!text.trim()) return;
    sendMessage(peerRole, { to: peerRole, type: 'txt', body: text.trim() });
    setText('');
  }

  function handleChip(chip: string) {
    sendMessage(peerRole, { to: peerRole, type: 'txt', body: chip });
  }

  function handleSendReq() {
    if (!reqForm.sup || !reqForm.qty) return;
    sendMessage(peerRole, { to: peerRole, type: 'req', body: 'Product purchase request', req: { product: reqForm.product, qty: parseInt(reqForm.qty) || 0, sup: reqForm.sup, reason: reqForm.reason } });
    setShowReqModal(false);
    setReqForm({ product: 'PMS', qty: '', sup: '', reason: '' });
  }

  function handleSendAlert() {
    if (!alertForm.title) return;
    sendMessage(peerRole, { to: peerRole, type: 'alert', body: 'Operations alert', alrt: { title: alertForm.title, pri: alertForm.pri, detail: alertForm.detail } });
    setShowAlertModal(false);
    setAlertForm({ title: '', pri: 'Urgent', detail: '' });
  }

  function renderMessage({ item }: { item: any }) {
    const isMe = item.from === role;
    const senderColor = ROLE_COLORS[item.from] || '#888';

    if (item.type === 'req') {
      return (
        <View style={[styles.msgWrapper, isMe ? styles.msgWrapperRight : styles.msgWrapperLeft]}>
          <View style={[styles.reqCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: senderColor, borderLeftWidth: 4 }]}>
            <Text style={[styles.reqTitle, { color: colors.text }]}>📦 Purchase Request</Text>
            {item.req && (
              <>
                <Text style={[styles.reqDetail, { color: colors.textMuted }]}>Product: <Text style={{ color: colors.text, fontWeight: '600' }}>{item.req.product}</Text></Text>
                <Text style={[styles.reqDetail, { color: colors.textMuted }]}>Quantity: <Text style={{ color: colors.text, fontWeight: '600' }}>{item.req.qty.toLocaleString()}L</Text></Text>
                <Text style={[styles.reqDetail, { color: colors.textMuted }]}>Supplier: <Text style={{ color: colors.text, fontWeight: '600' }}>{item.req.sup}</Text></Text>
                {item.req.reason ? <Text style={[styles.reqDetail, { color: colors.textMuted }]}>{item.req.reason}</Text> : null}
              </>
            )}
            <Text style={[styles.msgTime, { color: colors.textSubtle, marginTop: 4 }]}>{item.ts}</Text>
          </View>
        </View>
      );
    }

    if (item.type === 'alert') {
      const priColors: Record<string, string> = { Urgent: colors.error, Medium: colors.warning, Low: colors.info };
      const pri = item.alrt?.pri || 'Urgent';
      return (
        <View style={[styles.msgWrapper, isMe ? styles.msgWrapperRight : styles.msgWrapperLeft]}>
          <View style={[styles.alertCard, { backgroundColor: colors.errorBg, borderColor: priColors[pri] + '55', borderLeftColor: priColors[pri], borderLeftWidth: 4 }]}>
            <Text style={[styles.reqTitle, { color: priColors[pri] }]}>🚨 {item.alrt?.title}</Text>
            <Text style={[styles.reqDetail, { color: colors.textMuted }]}>Priority: <Text style={{ color: priColors[pri], fontWeight: '700' }}>{pri}</Text></Text>
            {item.alrt?.detail ? <Text style={[styles.reqDetail, { color: colors.text }]}>{item.alrt.detail}</Text> : null}
            <Text style={[styles.msgTime, { color: colors.textSubtle, marginTop: 4 }]}>{item.ts}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgWrapperRight : styles.msgWrapperLeft]}>
        <View style={[styles.bubble, { backgroundColor: isMe ? myColor : colors.surface, borderColor: isMe ? 'transparent' : colors.border }]}>
          <Text style={[styles.bubbleText, { color: isMe ? '#fff' : colors.text }]}>{item.body}</Text>
          <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.65)' : colors.textSubtle }]}>{item.ts}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding" keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: peerInfo.color }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <Text style={styles.headerAvatarText}>{peerInfo.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{peerInfo.name}</Text>
          <Text style={styles.headerRole}>{ROLE_LABELS[peerRole] || peerRole}</Text>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={item => String(item.id)}
        renderItem={renderMessage}
        contentContainerStyle={[styles.msgList, { paddingBottom: 12 }]}
        inverted={false}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubble-outline" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No messages yet. Say hi!</Text>
          </View>
        }
      />

      <View style={[styles.chipsRow, { borderTopColor: colors.border }]}>
        <FlatList
          data={chips}
          horizontal
          keyExtractor={c => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
          renderItem={({ item: chip }) => (
            <TouchableOpacity onPress={() => handleChip(chip)} style={[styles.chip, { borderColor: myColor + '55', backgroundColor: myColor + '10' }]}>
              <Text style={[styles.chipText, { color: myColor }]}>{chip}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={[styles.inputBar, { borderTopColor: colors.border, paddingBottom: botPad + 8, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => setShowReqModal(true)} style={[styles.attachBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="cube" size={18} color={myColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowAlertModal(true)} style={[styles.attachBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="warning" size={18} color={colors.warning} />
        </TouchableOpacity>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholder="Message..."
          placeholderTextColor={colors.textSubtle}
          value={text}
          onChangeText={setText}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity onPress={handleSend} disabled={!text.trim()} style={[styles.sendBtn, { backgroundColor: text.trim() ? myColor : colors.border }]}>
          <Ionicons name="send" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={showReqModal} transparent animationType="slide" onRequestClose={() => setShowReqModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReqModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Purchase Request</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {['PMS', 'AGO', 'DPK', 'LPG'].map(p => (
                <TouchableOpacity key={p} onPress={() => setReqForm(f => ({ ...f, product: p }))} style={[styles.chip, { backgroundColor: reqForm.product === p ? myColor : colors.surface, borderColor: reqForm.product === p ? myColor : colors.border }]}>
                  <Text style={{ color: reqForm.product === p ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {[{ key: 'qty', label: 'Quantity (L)', kb: 'numeric' as const }, { key: 'sup', label: 'Supplier' }, { key: 'reason', label: 'Reason' }].map(f => (
              <TextInput
                key={f.key}
                style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder={f.label}
                placeholderTextColor={colors.textSubtle}
                keyboardType={f.kb}
                value={(reqForm as any)[f.key]}
                onChangeText={v => setReqForm(fr => ({ ...fr, [f.key]: v }))}
              />
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: myColor }]} onPress={handleSendReq}>
                <Text style={styles.submitBtnText}>Send Request</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowReqModal(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showAlertModal} transparent animationType="slide" onRequestClose={() => setShowAlertModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAlertModal(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Send Operations Alert</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
              {['Urgent', 'Medium', 'Low'].map(p => (
                <TouchableOpacity key={p} onPress={() => setAlertForm(f => ({ ...f, pri: p }))} style={[styles.chip, { backgroundColor: alertForm.pri === p ? colors.error : colors.surface, borderColor: alertForm.pri === p ? colors.error : colors.border }]}>
                  <Text style={{ color: alertForm.pri === p ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {[{ key: 'title', label: 'Alert Title' }, { key: 'detail', label: 'Details' }].map(f => (
              <TextInput
                key={f.key}
                style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                placeholder={f.label}
                placeholderTextColor={colors.textSubtle}
                value={(alertForm as any)[f.key]}
                onChangeText={v => setAlertForm(fr => ({ ...fr, [f.key]: v }))}
              />
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.submitBtn, { flex: 1, backgroundColor: colors.error }]} onPress={handleSendAlert}>
                <Text style={styles.submitBtnText}>Send Alert</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowAlertModal(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerRole: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  msgList: { padding: 12 },
  msgWrapper: { marginBottom: 6 },
  msgWrapperRight: { alignItems: 'flex-end' },
  msgWrapperLeft: { alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 14, borderWidth: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 10, marginTop: 3, textAlign: 'right' },
  reqCard: { maxWidth: '85%', padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  alertCard: { maxWidth: '85%', padding: 12, borderRadius: 12, borderWidth: 1, gap: 3 },
  reqTitle: { fontSize: 13, fontWeight: '700' },
  reqDetail: { fontSize: 12 },
  chipsRow: { borderTopWidth: StyleSheet.hairlineWidth },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '500' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  attachBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  submitBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e3' },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
});
