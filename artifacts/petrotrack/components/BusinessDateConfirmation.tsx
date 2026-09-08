import React, { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '@/components/FormSheet';
import { useColors } from '@/hooks/useColors';
import { getBusinessDateConfirmationCopy } from '@/lib/business-date-confirmation';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type PendingConfirmation = {
  recordType: string;
  date: string;
  actionLabel: string;
};

type BusinessDateConfirmationProps = {
  visible: boolean;
  recordType: string;
  date: string;
  actionLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  embedded?: boolean;
};

export function BusinessDateConfirmation({
  visible,
  recordType,
  date,
  actionLabel,
  onCancel,
  onConfirm,
  embedded = false,
}: BusinessDateConfirmationProps) {
  const colors = useColors();
  const copy = getBusinessDateConfirmationCopy(recordType, date);

  const content = (
    <View style={[styles.sheet, embedded && styles.embeddedSheet, { backgroundColor: colors.surface }]}>
        <View style={[styles.iconBox, { backgroundColor: colors.warningBg }]}>
          <Ionicons name="calendar-outline" size={22} color={colors.warning} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{copy.body}</Text>
        <View style={[styles.dateCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.dateLabel, { color: colors.textMuted }]}>{copy.dateLabel}</Text>
          <Text style={[styles.dateValue, { color: colors.text }]}>{copy.dateValue}</Text>
        </View>
        <Text style={[styles.hint, { color: colors.textSubtle }]}>{copy.hint}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onCancel}
            style={[styles.cancelButton, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel submission"
          >
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Go back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={[styles.confirmButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel={`Confirm ${recordType} date and ${actionLabel.toLowerCase()}`}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.confirmText}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
    </View>
  );

  if (embedded) return visible ? content : null;

  return (
    <ModalSheet visible={visible} onClose={onCancel}>
      {content}
    </ModalSheet>
  );
}

export function useBusinessDateConfirmation() {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const actionRef = useRef<(() => void) | null>(null);

  const requestDateConfirmation = useCallback((
    recordType: string,
    date: string,
    onConfirm: () => void,
    actionLabel = 'Confirm & submit',
  ) => {
    actionRef.current = onConfirm;
    setPending({ recordType, date, actionLabel });
  }, []);

  const cancelDateConfirmation = useCallback(() => {
    actionRef.current = null;
    setPending(null);
  }, []);

  const confirmDate = useCallback(() => {
    const action = actionRef.current;
    actionRef.current = null;
    setPending(null);
    action?.();
  }, []);

  const confirmationModal = (
    <BusinessDateConfirmation
      visible={pending !== null}
      recordType={pending?.recordType ?? 'record'}
      date={pending?.date ?? ''}
      actionLabel={pending?.actionLabel ?? 'Confirm & submit'}
      onCancel={cancelDateConfirmation}
      onConfirm={confirmDate}
    />
  );

  const confirmationContent = (
    <BusinessDateConfirmation
      visible={pending !== null}
      recordType={pending?.recordType ?? 'record'}
      date={pending?.date ?? ''}
      actionLabel={pending?.actionLabel ?? 'Confirm & submit'}
      onCancel={cancelDateConfirmation}
      onConfirm={confirmDate}
      embedded
    />
  );

  return {
    requestDateConfirmation,
    confirmationModal,
    confirmationContent,
    hasPendingConfirmation: pending !== null,
  };
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  embeddedSheet: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  dateCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1.5,
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});