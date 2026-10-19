import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import type { CreditCustomer, CreditSaleDraft } from '@/lib/customer-ledger';

const CREDIT_ACCENT = '#62754D';
const SEARCH_THRESHOLD = 6;

const naira = (value: number) =>
  `₦${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const qty = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });

type Props = {
  /** MD-approved credit customers of the report's branch. */
  customers: CreditCustomer[];
  drafts: CreditSaleDraft[];
  onChange: (drafts: CreditSaleDraft[]) => void;
  unitPrice: number;
  unit: string;
  accent: string;
  /** Current ledger balance before this report, for the outstanding hint. */
  balanceFor?: (customerId: string) => number;
  testIDPrefix?: string;
};

/**
 * Lets the attendant (or a reviewer editing a report) record credit purchases
 * by several approved customers in one shift report.
 */
export function CreditSalesEditor({
  customers, drafts, onChange, unitPrice, unit, accent, balanceFor, testIDPrefix = 'shift-credit',
}: Props) {
  const colors = useColors();
  const selectedIds = new Set(drafts.map(draft => draft.customerId));

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const available = customers.filter(customer => !selectedIds.has(customer.id));
  const query = search.trim().toLowerCase();
  const filtered = query ? available.filter(customer => customer.name.toLowerCase().includes(query)) : available;

  const add = (customerId: string) => {
    if (!selectedIds.has(customerId)) onChange([...drafts, { customerId, quantity: '' }]);
    setOpen(false);
    setSearch('');
  };
  const remove = (customerId: string) => onChange(drafts.filter(draft => draft.customerId !== customerId));
  const setQuantity = (customerId: string, quantity: string) => {
    onChange(drafts.map(draft => draft.customerId === customerId ? { ...draft, quantity } : draft));
  };

  const parsed = drafts.map(draft => {
    const quantity = parseFloat(draft.quantity.replace(/,/g, '')) || 0;
    return { ...draft, quantityValue: quantity, amount: Number((quantity * unitPrice).toFixed(2)) };
  });
  const totalQuantity = parsed.reduce((total, line) => total + line.quantityValue, 0);
  const totalAmount = parsed.reduce((total, line) => total + line.amount, 0);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Credit Sales to Approved Customers</Text>
      {customers.length === 0 ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          No MD-approved credit customer is available for this branch. Ask the Accountant to create a profile.
        </Text>
      ) : (
        <>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Add each approved customer who bought on credit this shift, then enter how much each one took.
          </Text>
          {available.length === 0 ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>All approved customers have been added.</Text>
          ) : (
            <View>
              <TouchableOpacity
                testID={`${testIDPrefix}-dropdown`}
                accessibilityRole="combobox"
                accessibilityState={{ expanded: open }}
                onPress={() => { setOpen(value => !value); setSearch(''); }}
                style={[styles.dropdown, { backgroundColor: colors.background, borderColor: open ? accent : colors.border }]}
              >
                <Ionicons name="person-add-outline" size={16} color={CREDIT_ACCENT} />
                <Text style={[styles.dropdownText, { color: colors.textMuted }]}>
                  {drafts.length === 0 ? 'Select approved customer' : 'Add another approved customer'}
                </Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {open && (
                <View testID={`${testIDPrefix}-options`} style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {available.length > SEARCH_THRESHOLD && (
                    <View style={[styles.searchWrap, { borderColor: colors.border }]}>
                      <Ionicons name="search-outline" size={15} color={colors.textMuted} />
                      <TextInput
                        testID={`${testIDPrefix}-search`}
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Search customers"
                        placeholderTextColor={colors.textSubtle}
                        value={search}
                        onChangeText={setSearch}
                        autoFocus
                      />
                    </View>
                  )}
                  {filtered.length === 0 ? (
                    <Text style={[styles.hint, styles.option, { color: colors.textMuted }]}>No approved customer matches “{search}”.</Text>
                  ) : filtered.map((customer, index) => {
                    const balance = balanceFor?.(customer.id);
                    return (
                      <TouchableOpacity
                        key={customer.id}
                        testID={`${testIDPrefix}-customer-${customer.id}`}
                        onPress={() => add(customer.id)}
                        style={[styles.option, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
                      >
                        <Text style={[styles.optionName, { color: colors.text }]} numberOfLines={1}>{customer.name}</Text>
                        {balance !== undefined && (
                          <Text style={[styles.chipBalance, { color: balance > 0 ? colors.error : colors.success }]}>
                            {balance > 0 ? `Owes ${naira(balance)}` : balance < 0 ? `Advance ${naira(Math.abs(balance))}` : 'Balanced'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </>
      )}

      {parsed.map(line => {
        const customer = customers.find(candidate => candidate.id === line.customerId);
        const name = customer?.name ?? 'Customer no longer approved';
        const balance = balanceFor?.(line.customerId);
        const afterSale = balance === undefined ? undefined : balance + line.amount;
        return (
          <View
            key={line.customerId}
            testID={`${testIDPrefix}-line-${line.customerId}`}
            style={[styles.line, { borderColor: CREDIT_ACCENT + '33', backgroundColor: CREDIT_ACCENT + '0D' }]}
          >
            <View style={styles.lineHeader}>
              <Ionicons name="person-outline" size={15} color={customer ? CREDIT_ACCENT : colors.error} />
              <Text style={[styles.lineName, { color: customer ? colors.text : colors.error }]} numberOfLines={1}>{name}</Text>
              <TouchableOpacity
                testID={`${testIDPrefix}-remove-${line.customerId}`}
                accessibilityLabel={`Remove ${name}`}
                onPress={() => remove(line.customerId)}
                hitSlop={8}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                testID={`${testIDPrefix}-quantity-${line.customerId}`}
                style={[styles.input, { color: colors.text }]}
                placeholder={`Quantity (${unit})`}
                placeholderTextColor={colors.textSubtle}
                keyboardType="decimal-pad"
                value={line.quantity}
                onChangeText={value => setQuantity(line.customerId, value)}
              />
              <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>
            </View>
            {line.quantityValue > 0 && (
              <Text style={[styles.hint, { color: CREDIT_ACCENT }]}>
                {qty(line.quantityValue)} {unit} × ₦{unitPrice.toLocaleString()} = <Text style={styles.bold}>{naira(line.amount)}</Text>
              </Text>
            )}
            {afterSale !== undefined && line.quantityValue > 0 && (
              <Text style={[styles.hint, { color: afterSale > 0 ? colors.error : colors.success }]}>
                {afterSale > 0
                  ? `Outstanding after this sale: ${naira(afterSale)}`
                  : afterSale < 0
                    ? `Advance remaining after this sale: ${naira(Math.abs(afterSale))}`
                    : 'This sale will fully use the available advance.'}
              </Text>
            )}
          </View>
        );
      })}

      {parsed.length > 1 && (
        <View testID={`${testIDPrefix}-total`} style={[styles.total, { borderColor: CREDIT_ACCENT + '55' }]}>
          <Text style={[styles.totalLabel, { color: CREDIT_ACCENT }]}>
            {`${parsed.length} customers · ${qty(totalQuantity)} ${unit}`}
          </Text>
          <Text style={[styles.totalValue, { color: CREDIT_ACCENT }]}>{naira(totalAmount)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, gap: 7 },
  label: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  bold: { fontWeight: '800' },
  dropdown: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
  },
  dropdownText: { flex: 1, fontSize: 14 },
  menu: { marginTop: 4, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderBottomWidth: 1 },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  optionName: { flex: 1, fontSize: 14, fontWeight: '600' },
  chipBalance: { fontSize: 11, fontWeight: '600' },
  line: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineName: { flex: 1, fontSize: 13, fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  input: { flex: 1, paddingVertical: 8, fontSize: 14 },
  unit: { fontSize: 12, fontWeight: '600' },
  total: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 7 },
  totalLabel: { fontSize: 12, fontWeight: '700' },
  totalValue: { fontSize: 14, fontWeight: '800' },
});
