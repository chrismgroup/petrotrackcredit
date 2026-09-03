import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  overdue: { label: 'Overdue', color: '#B42318', bg: '#FCEBEB' },
  'due-soon': { label: 'Due within 2 weeks', color: '#9A6700', bg: '#FFF4CC' },
  'on-track': { label: 'More than 2 weeks', color: '#137333', bg: '#EAF5EA' },
};

const STATUS_META: Record<ActionItemStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#185FA5', bg: '#E6F1FB' },
  'on-going': { label: 'On-going', color: '#BA7517', bg: '#FAEEDA' },
  closed: { label: 'Closed', color: '#27500A', bg: '#EAF3DE' },
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
}: {
  items: ActionItem[];
  colors: AppColors;
  showBranch?: boolean;
  emptyText?: string;
  canUpdate?: (item: ActionItem) => boolean;
  onStatusChange?: (item: ActionItem, status: ActionItemStatus) => void;
  onRowPress?: (item: ActionItem) => void;
}) {
  const columns = [
    { key: 'id', label: 'ID', width: 82 },
    { key: 'date', label: 'Date', width: 105 },
    { key: 'description', label: 'Description', width: 260 },
    { key: 'party', label: 'Action party', width: 170 },
    { key: 'target', label: 'Target close out', width: 150 },
    { key: 'status', label: 'Status', width: 140 },
    ...(showBranch ? [{ key: 'branch', label: 'Branch', width: 155 }] : []),
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  return (
    <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="flash-outline" size={26} color={colors.textSubtle} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ width: tableWidth }}>
            <View style={[styles.headerRow, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
              {columns.map(column => (
                <Text key={column.key} style={[styles.headerCell, { color: colors.textMuted, width: column.width }]}>
                  {column.label}
                </Text>
              ))}
            </View>
            {items.map(item => {
              const urgency = actionItemUrgencyMeta(item.targetDate);
              const status = STATUS_META[item.status];
              const editable = !!canUpdate?.(item) && item.status !== 'closed';
              const row = (
                <View style={[styles.row, { borderBottomColor: colors.border, borderLeftColor: urgency.color }]}>
                  <View style={[styles.cell, { width: 82 }]}>
                    <Text style={[styles.idText, { color: colors.primary }]}>#{String(item.id).slice(-6)}</Text>
                  </View>
                  <View style={[styles.cell, { width: 105 }]}>
                    <Text style={[styles.cellText, { color: colors.text }]}>{fmtDate(item.createdAt)}</Text>
                  </View>
                  <View style={[styles.cell, { width: 260, alignItems: 'flex-start' }]}>
                    <Text style={[styles.descriptionTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                    {!!item.desc && <Text style={[styles.descriptionText, { color: colors.textMuted }]} numberOfLines={2}>{item.desc}</Text>}
                  </View>
                  <View style={[styles.cell, { width: 170, alignItems: 'flex-start' }]}>
                    <Text style={[styles.cellText, { color: colors.text }]} numberOfLines={2}>{item.actionPartyName}</Text>
                  </View>
                  <View style={[styles.cell, { width: 150, alignItems: 'flex-start' }]}>
                    <Text style={[styles.cellText, { color: urgency.color, fontWeight: '700' }]}>{fmtDate(item.targetDate)}</Text>
                    <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
                  </View>
                  <View style={[styles.cell, { width: 140, alignItems: 'flex-start' }]}>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                    {item.status === 'closed' ? (
                      <View style={styles.locked}>
                        <Ionicons name="lock-closed-outline" size={11} color={colors.textSubtle} />
                        <Text style={[styles.lockedText, { color: colors.textSubtle }]}>Locked</Text>
                      </View>
                    ) : editable && onStatusChange ? (
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
                  {showBranch ? (
                    <View style={[styles.cell, { width: 155, alignItems: 'flex-start' }]}>
                      <Text style={[styles.cellText, { color: colors.text }]} numberOfLines={2}>{item.branchName}</Text>
                    </View>
                  ) : null}
                </View>
              );
              return onRowPress ? (
                <TouchableOpacity key={item.id} onPress={() => onRowPress(item)} activeOpacity={0.8}>
                  {row}
                </TouchableOpacity>
              ) : <View key={item.id}>{row}</View>;
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tableCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  headerCell: { paddingHorizontal: 10, paddingVertical: 9, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  row: { minHeight: 70, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3 },
  cell: { justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 9 },
  idText: { fontSize: 11, fontWeight: '800' },
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