import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  accent?: string;
  helper?: string;
  placeholder?: string;
  dialogTitle?: string;
  dialogSubtitle?: string;
  testID?: string;
  /** Earliest selectable date (YYYY-MM-DD or "today"). Earlier days are greyed out. */
  minDate?: string;
  /** Latest selectable date (YYYY-MM-DD or "today"). Later days are greyed out. */
  maxDate?: string;
  /** Shows a "Clear date" action for optional fields. */
  clearable?: boolean;
  /** Hide the built-in label when the screen renders its own. */
  showLabel?: boolean;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

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

export function formatPickedDate(value: string) {
  return parseDate(value).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

export function AppliedDateField({
  value, onChange, label = 'Applies on *', accent, helper,
  placeholder = 'Select the date this record applies to',
  dialogTitle = 'Select applies-on date',
  dialogSubtitle = 'Choose the business date for this record.',
  testID, minDate, maxDate, clearable, showLabel = true,
}: Props) {
  const fieldTestID = testID ?? (label.startsWith('View shift reports') ? 'report-history-date' : 'report-business-date');
  const resolveBound = (bound?: string) => (bound === 'today' ? dateKey(new Date()) : bound && DATE_KEY.test(bound) ? bound : '');
  const minKey = resolveBound(minDate);
  const maxKey = resolveBound(maxDate);
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [pickingYear, setPickingYear] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = parseDate(value || (maxKey && maxKey < dateKey(new Date()) ? maxKey : ''));
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const todayKey = dateKey(new Date());
  const todayAllowed = (!minKey || todayKey >= minKey) && (!maxKey || todayKey <= maxKey);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const first = minKey ? Number(minKey.slice(0, 4)) : now - 100;
    const last = maxKey ? Number(maxKey.slice(0, 4)) : now + 30;
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => last - index);
  }, [minKey, maxKey]);

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
      {showLabel ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <TouchableOpacity
        testID={fieldTestID}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${formatPickedDate(value)}. Tap to change` : `${label}: ${placeholder}`}
        onPress={() => { setPickingYear(false); setOpen(true); }}
        activeOpacity={0.8}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: value ? color : colors.border }]}
      >
        <Ionicons name="calendar-outline" size={17} color={value ? color : colors.textMuted} />
        <Text style={[styles.value, { color: value ? colors.text : colors.textSubtle }]}>
          {value ? formatPickedDate(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
      </TouchableOpacity>
      {helper === '' ? null : (
        <Text style={[styles.helper, { color: colors.textMuted }]}>
          {helper ?? 'Submission time is recorded separately for auditing.'}
        </Text>
      )}

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
                <Text style={[styles.dialogTitle, { color: colors.text }]}>{dialogTitle}</Text>
                <Text style={[styles.dialogSub, { color: colors.textMuted }]}>{dialogSubtitle}</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close-circle" size={23} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.monthRow}>
              <View style={styles.arrowGroup}>
                <TouchableOpacity
                  accessibilityLabel="Previous year"
                  onPress={() => setMonth(current => new Date(current.getFullYear() - 1, current.getMonth(), 1))}
                  style={styles.arrow}
                >
                  <Ionicons name="play-back" size={16} color={color} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Previous month"
                  onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                  style={styles.arrow}
                >
                  <Ionicons name="chevron-back" size={20} color={color} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                testID={`${fieldTestID}-year-toggle`}
                accessibilityLabel="Choose year"
                onPress={() => setPickingYear(current => !current)}
                style={styles.monthTitleButton}
              >
                <Text style={[styles.monthTitle, { color: colors.text }]}>
                  {month.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
                </Text>
                <Ionicons name={pickingYear ? 'chevron-up' : 'chevron-down'} size={14} color={color} />
              </TouchableOpacity>
              <View style={styles.arrowGroup}>
                <TouchableOpacity
                  accessibilityLabel="Next month"
                  onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                  style={styles.arrow}
                >
                  <Ionicons name="chevron-forward" size={20} color={color} />
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityLabel="Next year"
                  onPress={() => setMonth(current => new Date(current.getFullYear() + 1, current.getMonth(), 1))}
                  style={styles.arrow}
                >
                  <Ionicons name="play-forward" size={16} color={color} />
                </TouchableOpacity>
              </View>
            </View>

            {pickingYear ? (
              <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>
                {years.map(year => {
                  const active = year === month.getFullYear();
                  return (
                    <TouchableOpacity
                      key={year}
                      testID={`${fieldTestID}-year-${year}`}
                      onPress={() => { setMonth(current => new Date(year, current.getMonth(), 1)); setPickingYear(false); }}
                      style={[styles.yearCell, { borderColor: active ? color : colors.border, backgroundColor: active ? color : 'transparent' }]}
                    >
                      <Text style={[styles.yearText, { color: active ? '#fff' : colors.text }]}>{year}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
            <>
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text key={`${day}-${index}`} style={[styles.weekDay, { color: colors.textMuted }]}>{day}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {cells.map((day, index) => {
                const key = day === null ? '' : dateKey(new Date(month.getFullYear(), month.getMonth(), day));
                const selected = day !== null && key === value;
                const blocked = day !== null && ((!!minKey && key < minKey) || (!!maxKey && key > maxKey));
                return (
                  <TouchableOpacity
                    testID={day === null ? undefined : `${testID ?? 'report-business-date'}-day-${day}`}
                    key={`${month.toISOString()}-${index}`}
                    disabled={day === null || blocked}
                    onPress={() => day !== null && selectDay(day)}
                    style={[styles.day, selected && { backgroundColor: color }]}
                  >
                    <Text style={[styles.dayText, { color: selected ? '#fff' : day === null ? 'transparent' : blocked ? colors.textSubtle : colors.text }, blocked && styles.dayBlocked]}>
                      {day ?? 0}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </>
            )}
            {clearable && value ? (
              <TouchableOpacity
                onPress={() => { onChange(''); setOpen(false); }}
                style={[styles.todayButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.todayText, { color: colors.textMuted }]}>Clear date</Text>
              </TouchableOpacity>
            ) : null}
            {todayAllowed ? (
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
            ) : null}
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
  arrowGroup: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 15, fontWeight: '800' },
  monthTitleButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  yearScroll: { maxHeight: 260 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  yearCell: { width: '22%', flexGrow: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  yearText: { fontSize: 14, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  dayText: { fontSize: 13, fontWeight: '600' },
  dayBlocked: { textDecorationLine: 'line-through', opacity: 0.5 },
  todayButton: { alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingVertical: 9, marginTop: 14 },
  todayText: { fontSize: 13, fontWeight: '800' },
});