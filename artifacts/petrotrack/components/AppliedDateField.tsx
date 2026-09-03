import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  accent?: string;
  helper?: string;
};

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function displayDate(value: string) {
  if (!value) return 'Select the date this record applies to';
  const date = parseDate(value);
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function AppliedDateField({
  value, onChange, label = 'Applies on *', accent, helper,
}: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = parseDate(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (value) {
      const date = parseDate(value);
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [value]);

  const cells = useMemo(() => {
    const firstDay = month.getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: firstDay }, () => null as number | null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [month]);

  const color = accent ?? colors.primary;

  function selectDay(day: number) {
    onChange(dateKey(new Date(month.getFullYear(), month.getMonth(), day)));
    setOpen(false);
  }

  return (
    <>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity
        testID={label.startsWith('View shift reports') ? 'report-history-date' : 'report-business-date'}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: value ? color : colors.border }]}
      >
        <Ionicons name="calendar-outline" size={17} color={value ? color : colors.textMuted} />
        <Text style={[styles.value, { color: value ? colors.text : colors.textSubtle }]}>
          {displayDate(value)}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
      </TouchableOpacity>
      <Text style={[styles.helper, { color: colors.textMuted }]}>
        {helper ?? 'Submission time is recorded separately for auditing.'}
      </Text>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={event => event.stopPropagation()}
            style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <View style={styles.dialogHeader}>
              <View>
                <Text style={[styles.dialogTitle, { color: colors.text }]}>Select applies-on date</Text>
                <Text style={[styles.dialogSub, { color: colors.textMuted }]}>Choose the business date for this record.</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close-circle" size={23} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.monthRow}>
              <TouchableOpacity
                onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                style={styles.arrow}
              >
                <Ionicons name="chevron-back" size={20} color={color} />
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: colors.text }]}>
                {month.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                style={styles.arrow}
              >
                <Ionicons name="chevron-forward" size={20} color={color} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text key={`${day}-${index}`} style={[styles.weekDay, { color: colors.textMuted }]}>{day}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, index) => {
                const selected = day !== null &&
                  dateKey(new Date(month.getFullYear(), month.getMonth(), day)) === value;
                return (
                  <TouchableOpacity
                    testID={day === null ? undefined : `report-business-date-day-${day}`}
                    key={`${month.toISOString()}-${index}`}
                    disabled={day === null}
                    onPress={() => day !== null && selectDay(day)}
                    style={[styles.day, selected && { backgroundColor: color }]}
                  >
                    <Text style={[styles.dayText, { color: selected ? '#fff' : day === null ? 'transparent' : colors.text }]}>
                      {day ?? 0}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => {
                const today = dateKey(new Date());
                const date = parseDate(today);
                setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                onChange(today);
                setOpen(false);
              }}
              style={[styles.todayButton, { borderColor: color }]}
            >
              <Text style={[styles.todayText, { color }]}>Use today</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 7 },
  field: { minHeight: 54, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { flex: 1, fontSize: 14, lineHeight: 20 },
  helper: { fontSize: 11, marginTop: 5, lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 },
  dialog: { borderWidth: 1, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  dialogHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  dialogTitle: { fontSize: 16, fontWeight: '800' },
  dialogSub: { fontSize: 11, marginTop: 3 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 12 },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 15, fontWeight: '800' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  dayText: { fontSize: 13, fontWeight: '600' },
  todayButton: { alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 9, marginTop: 14 },
  todayText: { fontSize: 13, fontWeight: '800' },
});