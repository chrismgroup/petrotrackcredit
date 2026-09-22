import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  ActionItem,
  ActionItemStatus,
  ActionItemUrgency,
  fmtDate,
  getActionItemUrgency,
} from '@/context/AppContext';

type AppColors = {
  surface: string;
  background: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
};

const URGENCY_META: Record<ActionItemUrgency, { label: string; color: string; bg: string }> = {
  overdue: { label: 'Overdue', color: '#B42318', bg: '#E9F0EB' },
  'due-soon': { label: 'Due within 2 weeks', color: '#9A6700', bg: '#FFF4CC' },
  'on-track': { label: 'More than 2 weeks', color: '#137333', bg: '#EAF5EA' },
};

const STATUS_META: Record<ActionItemStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#286247', bg: '#EAF2ED' },
  'on-going': { label: 'On-going', color: '#71805B', bg: '#EEF2E4' },
  closed: { label: 'Closed', color: '#1F6848', bg: '#E5F1E9' },
};

export function actionItemUrgencyMeta(targetDate: string) {
  return URGENCY_META[getActionItemUrgency(targetDate)];
}

export function ActionItemsTable({
  items,
  colors,
  showBranch = false,
  emptyText = 'No action items',
  canUpdate,
  onStatusChange,
  onRowPress,
  showStatusActions = false,
}: {
  items: ActionItem[];
  colors: AppColors;
  showBranch?: boolean;
  emptyText?: string;
  canUpdate?: (item: ActionItem) => boolean;
  onStatusChange?: (item: ActionItem, status: ActionItemStatus) => void;
  onRowPress?: (item: ActionItem) => void;
  showStatusActions?: boolean;
}) {
  return (
    <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="flash-outline" size={26} color={colors.textSubtle} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>
        </View>
      ) : (
        <View>
          {items.map(item => {
            const urgency = actionItemUrgencyMeta(item.targetDate);
            const status = STATUS_META[item.status];
            const editable = showStatusActions && !!canUpdate?.(item) && item.status !== 'closed';
            const card = (
              <View style={[styles.row, { borderBottomColor: colors.border, borderLeftColor: urgency.color }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex}>
                    <Text style={[styles.descriptionTitle, { color: colors.text }]}>{item.title}</Text>
                    {!!item.desc && <Text style={[styles.descriptionText, { color: colors.textMuted }]} numberOfLines={3}>{item.desc}</Text>}
                  </View>
                  {onRowPress ? <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} /> : null}
                </View>
                <View style={styles.detailsGrid}>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Action party</Text>
                    <Text style={[styles.cellText, { color: colors.text }]} numberOfLines={2}>{item.actionPartyName}</Text>
                  </View>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Close-out date</Text>
                    <Text style={[styles.cellText, { color: urgency.color, fontWeight: '700' }]}>{fmtDate(item.targetDate)}</Text>
                    <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
                  </View>
                  <View style={styles.detailCell}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Status</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                    {item.status === 'closed' && (
                      <View style={styles.locked}>
                        <Ionicons name="lock-closed-outline" size={11} color={colors.textSubtle} />
                        <Text style={[styles.lockedText, { color: colors.textSubtle }]}>Locked</Text>
                      </View>
                    )}
                  </View>
                  {showBranch && (
                    <View style={styles.detailCell}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Branch</Text>
                      <Text style={[styles.cellText, { color: colors.text }]} numberOfLines={2}>{item.branchName}</Text>
                    </View>
                  )}
                </View>
                {editable && onStatusChange ? (
                  <View style={styles.actionButtons}>
                    {(['open', 'on-going', 'closed'] as ActionItemStatus[]).map(nextStatus => (
                      <TouchableOpacity
                        key={nextStatus}
                        onPress={() => onStatusChange(item, nextStatus)}
                        style={[styles.actionButton, {
                          borderColor: item.status === nextStatus ? status.color : colors.border,
                          backgroundColor: item.status === nextStatus ? status.color : colors.background,
                        }]}
                      >
                        <Text style={[styles.actionButtonText, { color: item.status === nextStatus ? '#fff' : colors.textMuted }]}>
                          {nextStatus === 'on-going' ? 'Go' : nextStatus === 'closed' ? 'Close' : 'Open'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            );
            return onRowPress ? (
              <TouchableOpacity key={item.id} onPress={() => onRowPress(item)} activeOpacity={0.8} accessibilityLabel={`Open action item ${item.title}`}>
                {card}
              </TouchableOpacity>
            ) : <View key={item.id}>{card}</View>;
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tableCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailCell: { flexGrow: 1, flexBasis: '42%', minWidth: 118, gap: 3 },
  detailLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  flex: { flex: 1 },
  cellText: { fontSize: 11, lineHeight: 15 },
  descriptionTitle: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  descriptionText: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  urgencyText: { fontSize: 9, marginTop: 2 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  lockedText: { fontSize: 9 },
  actionButtons: { flexDirection: 'row', gap: 3, marginTop: 5 },
  actionButton: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  actionButtonText: { fontSize: 9, fontWeight: '700' },
  empty: { minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  emptyText: { fontSize: 12 },
});