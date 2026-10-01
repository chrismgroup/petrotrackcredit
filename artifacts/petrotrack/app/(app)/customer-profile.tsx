import { Ionicons } from '@expo/vector-icons';
import * as MailComposer from 'expo-mail-composer';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenLayout } from '@/components/ScreenLayout';
import { fmt, ROLE_COLORS, useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  customerLedgerBalance,
  customerLedgerPeriodRange,
  customerStatementForPeriod,
  type CreditCustomer,
  type CustomerLedgerPeriod,
  type CustomerStatement,
} from '@/lib/customer-ledger';

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function html(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function invoiceHtml(
  customer: CreditCustomer,
  statement: CustomerStatement,
  company: { name?: string; address?: string; phone?: string; email?: string },
  branchName: string,
): string {
  let running = statement.openingBalance;
  const transactions = [
    ...statement.purchases.map(purchase => ({
      id: `sale-${purchase.id}`,
      date: purchase.date,
      type: 'Purchase',
      details: `${purchase.product} — ${purchase.quantity.toLocaleString()} ${purchase.unit} × ₦${purchase.unitPrice.toLocaleString()}`,
      debit: purchase.amount,
      credit: 0,
    })),
    ...statement.payments.map(payment => ({
      id: `payment-${payment.id}`,
      date: payment.date,
      type: 'Payment / Advance',
      details: payment.reference || payment.note || 'Customer payment',
      debit: 0,
      credit: payment.amount,
    })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const rows = transactions.map(transaction => {
    running += transaction.debit - transaction.credit;
    return `<tr><td>${html(transaction.date)}</td><td>${html(transaction.type)}</td><td>${html(transaction.details)}</td><td class="num">${transaction.debit ? `₦${transaction.debit.toLocaleString()}` : '—'}</td><td class="num">${transaction.credit ? `₦${transaction.credit.toLocaleString()}` : '—'}</td><td class="num">₦${running.toLocaleString()}</td></tr>`;
  }).join('');
  const litres = statement.purchases.filter(purchase => purchase.unit === 'L').reduce((total, purchase) => total + purchase.quantity, 0);
  const kilograms = statement.purchases.filter(purchase => purchase.unit === 'kg').reduce((total, purchase) => total + purchase.quantity, 0);
  const quantitySummary = [litres > 0 ? `${litres.toLocaleString()} L` : '', kilograms > 0 ? `${kilograms.toLocaleString()} kg` : ''].filter(Boolean).join(' · ') || '0';
  const balanceLabel = statement.closingBalance > 0 ? 'Amount Outstanding' : statement.closingBalance < 0 ? 'Advance Available' : 'Balance';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17231c;padding:28px;font-size:12px}h1{font-size:22px;margin:0;color:#225B40}.muted{color:#65736b}.top{display:flex;justify-content:space-between;border-bottom:2px solid #225B40;padding-bottom:16px;margin-bottom:18px}.customer{background:#f3f7f4;padding:14px;border-radius:8px;margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 24px}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#225B40;color:white;text-align:left;padding:8px}td{border-bottom:1px solid #dde5df;padding:8px}.num{text-align:right;white-space:nowrap}.summary{margin-left:auto;margin-top:16px;width:310px}.summary div{display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #dde5df}.total{font-size:15px;font-weight:700;color:#225B40}.footer{margin-top:26px;color:#65736b;font-size:10px;text-align:center}
  </style></head><body>
    <div class="top"><div><h1>${html(company.name || 'Petrotrack')}</h1><div class="muted">${html(company.address || '')}</div><div class="muted">${html(company.phone || '')} ${company.email ? `· ${html(company.email)}` : ''}</div></div><div><strong>CUSTOMER INVOICE</strong><br><span class="muted">${html(statement.from)} to ${html(statement.to)}</span></div></div>
    <div class="customer"><strong>${html(customer.name)}</strong><div class="grid"><span>${html(customer.address || 'No address recorded')}</span><span>Branch: ${html(branchName)}</span><span>Email: ${html(customer.email || 'Not recorded')}</span><span>Phone: ${html(customer.phone)}</span><span>Contact person: ${html(customer.contactPerson || 'Not recorded')}</span></div></div>
    <table><thead><tr><th>Date</th><th>Transaction</th><th>Details</th><th class="num">Purchase</th><th class="num">Payment</th><th class="num">Balance</th></tr></thead><tbody>
      <tr><td>${html(statement.from)}</td><td>Opening balance</td><td>Balance brought forward</td><td></td><td></td><td class="num">₦${statement.openingBalance.toLocaleString()}</td></tr>${rows || '<tr><td colspan="6">No transactions in this period.</td></tr>'}
    </tbody></table>
    <div class="summary"><div><span>Total quantity</span><strong>${quantitySummary}</strong></div><div><span>Total purchases</span><strong>₦${statement.totalPurchases.toLocaleString()}</strong></div><div><span>Total payments / advances</span><strong>₦${statement.totalPayments.toLocaleString()}</strong></div><div class="total"><span>${balanceLabel}</span><strong>₦${Math.abs(statement.closingBalance).toLocaleString()}</strong></div></div>
    <div class="footer">Generated from approved customer purchases and recorded payments in Petrotrack.</div>
  </body></html>`;
}

export default function CustomerProfileScreen() {
  const {
    role, branches, companyInfo, pumpDailyReports, creditCustomers = [], customerPayments = [],
    addCreditCustomer, updateCreditCustomer, approveCreditCustomer, rejectCreditCustomer, addCustomerPayment,
  } = useApp();
  const colors = useColors();
  const roleColor = ROLE_COLORS[role || 'acc'] || colors.primary;
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [customerBranchId, setCustomerBranchId] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState('');
  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localDateKey());
  const [paymentReference, setPaymentReference] = useState('');
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [invoiceCustomerId, setInvoiceCustomerId] = useState('');
  const [invoicePeriod, setInvoicePeriod] = useState<CustomerLedgerPeriod>('monthly');
  const [invoiceAnchorDate, setInvoiceAnchorDate] = useState(localDateKey());
  const approvedCustomers = creditCustomers.filter(customer => customer.status === 'approved');

  function createCustomer() {
    const details = {
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
      address: customerAddress,
      contactPerson,
      branchId: customerBranchId,
    };
    const saved = editingCustomerId
      ? updateCreditCustomer(editingCustomerId, details)
      : addCreditCustomer(details);
    if (!saved) {
      Alert.alert('Customer not created', 'Enter a unique customer name, phone number, and branch.');
      return;
    }
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerAddress('');
    setContactPerson('');
    setCustomerBranchId('');
    setEditingCustomerId('');
    Alert.alert('Submitted', `The ${editingCustomerId ? 'updated ' : ''}customer profile has been sent to the MD for approval.`);
  }

  function editCustomer(customer: CreditCustomer) {
    setEditingCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerEmail(customer.email ?? '');
    setCustomerAddress(customer.address ?? '');
    setContactPerson(customer.contactPerson ?? '');
    setCustomerBranchId(customer.branchId);
  }

  function cancelEdit() {
    setEditingCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerAddress('');
    setContactPerson('');
    setCustomerBranchId('');
  }

  function recordCustomerPayment() {
    const amount = Number(paymentAmount.replace(/,/g, ''));
    if (!addCustomerPayment({
      customerId: paymentCustomerId,
      amount,
      date: paymentDate,
      reference: paymentReference,
    })) {
      Alert.alert('Payment not recorded', 'Select an approved customer and enter a valid amount and date.');
      return;
    }
    setPaymentAmount('');
    setPaymentReference('');
    Alert.alert('Payment recorded', 'The customer ledger and available advance have been updated.');
  }

  function selectedInvoice() {
    const customer = approvedCustomers.find(item => item.id === invoiceCustomerId);
    const range = customerLedgerPeriodRange(invoiceAnchorDate, invoicePeriod);
    if (!customer || !range) {
      Alert.alert('Invoice details required', 'Select an approved customer and enter a valid period date.');
      return null;
    }
    const statement = customerStatementForPeriod(customer.id, pumpDailyReports, customerPayments, range);
    const branchName = branches.find(branch => branch.id === customer.branchId)?.name ?? customer.branchId;
    return {
      customer,
      statement,
      title: `${customer.name} invoice ${range.from} to ${range.to}`,
      markup: invoiceHtml(customer, statement, companyInfo, branchName),
    };
  }

  async function generateInvoice() {
    const invoice = selectedInvoice();
    if (!invoice) return;
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html: invoice.markup });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: invoice.markup });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: invoice.title });
      } else {
        Alert.alert('Invoice created', `The invoice was generated at ${uri}.`);
      }
    } catch (error: any) {
      if (!String(error?.message ?? '').toLowerCase().includes('cancel')) {
        Alert.alert('Invoice failed', error?.message ?? 'The customer invoice could not be generated.');
      }
    }
  }

  async function emailInvoice() {
    const invoice = selectedInvoice();
    if (!invoice) return;
    if (!invoice.customer.email) {
      Alert.alert('Email address required', 'Add a registered email address to this customer profile before forwarding an invoice.');
      return;
    }
    try {
      if (!await MailComposer.isAvailableAsync()) {
        Alert.alert('Email unavailable', 'No configured email application is available on this device.');
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: invoice.markup });
      const balance = invoice.statement.closingBalance;
      await MailComposer.composeAsync({
        recipients: [invoice.customer.email],
        subject: invoice.title,
        body: `Dear ${invoice.customer.contactPerson || invoice.customer.name},\n\nPlease find attached your customer invoice for ${invoice.statement.from} to ${invoice.statement.to}.\n\n${balance > 0 ? `Outstanding balance: ${fmt(balance)}` : balance < 0 ? `Advance available: ${fmt(Math.abs(balance))}` : 'Your account is balanced.'}\n\nRegards,\n${companyInfo.name || 'Accounts'}`,
        attachments: [uri],
      });
    } catch (error: any) {
      Alert.alert('Email failed', error?.message ?? 'The invoice email could not be prepared.');
    }
  }

  return (
    <ScreenLayout title="Customer Profile">
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bottomOffset={32}>
        <View style={[styles.hero, { backgroundColor: roleColor }]}>
          <View style={styles.heroIcon}><Ionicons name="people-outline" size={23} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Customer Profile</Text>
            <Text style={styles.heroText}>Create and approve credit customers, track outstanding balances, and record payments or advances.</Text>
          </View>
        </View>

        {role === 'acc' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{editingCustomerId ? 'Edit Customer Profile' : 'Create Customer Profile'}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{editingCustomerId ? 'Saving changes returns the profile to the MD for approval.' : 'New profiles are sent to the MD for approval before attendants can select them.'}</Text>
            {[
              ['Customer name *', customerName, setCustomerName],
              ['Phone number *', customerPhone, setCustomerPhone],
              ['Email', customerEmail, setCustomerEmail],
              ['Address', customerAddress, setCustomerAddress],
              ['Contact person', contactPerson, setContactPerson],
            ].map(([label, value, setter]) => (
              <TextInput
                key={label as string}
                value={value as string}
                onChangeText={setter as (value: string) => void}
                placeholder={label as string}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              />
            ))}
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Branch *</Text>
            <View style={styles.options}>
              {branches.map(branch => (
                <TouchableOpacity
                  key={branch.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: customerBranchId === branch.id }}
                  onPress={() => setCustomerBranchId(branch.id)}
                  style={[
                    styles.option,
                    {
                      borderColor: customerBranchId === branch.id ? roleColor : colors.border,
                      backgroundColor: customerBranchId === branch.id ? roleColor : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: customerBranchId === branch.id ? '#fff' : colors.text }}>{branch.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionRow}>
              {editingCustomerId && (
                <TouchableOpacity onPress={cancelEdit} style={[styles.actionButton, { backgroundColor: colors.textMuted }]}>
                  <Text style={styles.primaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={createCustomer} style={[styles.actionButton, { backgroundColor: roleColor }]}>
                <Text style={styles.primaryButtonText}>{editingCustomerId ? 'Save and Resubmit' : 'Send to MD for Approval'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Customer Profiles</Text>
          <Text style={[styles.count, { color: roleColor, backgroundColor: roleColor + '16' }]}>{creditCustomers.length}</Text>
        </View>
        {creditCustomers.length === 0 && (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="person-add-outline" size={24} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No customer profiles have been created.</Text>
          </View>
        )}
        {creditCustomers.map(customer => {
          const balance = customerLedgerBalance(customer.id, pumpDailyReports, customerPayments, localDateKey());
          const purchaseHistory = customerStatementForPeriod(
            customer.id,
            pumpDailyReports,
            customerPayments,
            { from: customer.createdAt.slice(0, 10) || '2000-01-01', to: localDateKey() },
          ).purchases;
          const rejectionReason = rejectionReasons[customer.id] ?? '';
          return (
            <View key={customer.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.profileHeader}>
                <View style={[styles.profileIcon, { backgroundColor: roleColor + '16' }]}>
                  <Ionicons name="person-outline" size={18} color={roleColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.customerName, { color: colors.text }]}>{customer.name}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    {branches.find(branch => branch.id === customer.branchId)?.name ?? customer.branchId} · {customer.phone}
                  </Text>
                </View>
                <Text style={[styles.status, { color: customer.status === 'approved' ? colors.success : customer.status === 'rejected' ? colors.error : roleColor }]}>
                  {customer.status.replace('_', ' ')}
                </Text>
              </View>
              <View style={[styles.detailsBox, { borderColor: colors.border }]}> 
                <Text style={[styles.detailText, { color: colors.textMuted }]}>Address: {customer.address || 'Not recorded'}</Text>
                <Text style={[styles.detailText, { color: colors.textMuted }]}>Email: {customer.email || 'Not recorded'}</Text>
                <Text style={[styles.detailText, { color: colors.textMuted }]}>Contact person: {customer.contactPerson || 'Not recorded'}</Text>
              </View>
              {role === 'acc' && (
                <TouchableOpacity onPress={() => editCustomer(customer)} style={[styles.editButton, { borderColor: roleColor }]}>
                  <Ionicons name="create-outline" size={14} color={roleColor} />
                  <Text style={{ color: roleColor, fontSize: 11, fontWeight: '700' }}>Edit customer details</Text>
                </TouchableOpacity>
              )}
              {customer.status === 'approved' && (
                <View style={[styles.balanceBox, { backgroundColor: balance > 0 ? colors.error + '10' : colors.success + '10' }]}>
                  <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>{balance > 0 ? 'Outstanding balance' : balance < 0 ? 'Advance available' : 'Account balance'}</Text>
                  <Text style={[styles.balanceValue, { color: balance > 0 ? colors.error : balance < 0 ? colors.success : colors.text }]}>
                    {fmt(Math.abs(balance))}
                  </Text>
                </View>
              )}
              {customer.status === 'approved' && purchaseHistory.length > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={[styles.historyTitle, { color: colors.text }]}>Recent purchases</Text>
                  {purchaseHistory.slice(-3).reverse().map(purchase => (
                    <View key={purchase.id} style={[styles.purchaseRow, { borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.purchaseProduct, { color: colors.text }]}>{purchase.product} · {purchase.date}</Text>
                        <Text style={[styles.meta, { color: colors.textMuted }]}>{purchase.quantity.toLocaleString()} {purchase.unit} × ₦{purchase.unitPrice.toLocaleString()}/{purchase.unit}</Text>
                      </View>
                      <Text style={[styles.purchaseAmount, { color: roleColor }]}>{fmt(purchase.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(role === 'md' || role === 'admin') && customer.status === 'pending_md' && (
                <>
                  <TextInput
                    value={rejectionReason}
                    onChangeText={value => setRejectionReasons(previous => ({ ...previous, [customer.id]: value }))}
                    placeholder="Rejection reason (required only to reject)"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                  />
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => approveCreditCustomer(customer.id)} style={[styles.actionButton, { backgroundColor: colors.success }]}>
                      <Text style={styles.primaryButtonText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (!rejectCreditCustomer(customer.id, rejectionReason)) {
                          Alert.alert('Reason required', 'Enter a rejection reason.');
                        } else {
                          setRejectionReasons(previous => ({ ...previous, [customer.id]: '' }));
                        }
                      }}
                      style={[styles.actionButton, { backgroundColor: colors.error }]}
                    >
                      <Text style={styles.primaryButtonText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        })}

        {(role === 'acc' || role === 'admin') && approvedCustomers.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Generate Customer Invoice</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>The invoice uses approved purchases at the unit price stored on each branch shift report. Payments and advances are deducted to calculate the closing balance.</Text>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Customer</Text>
            <View style={styles.customerOptions}>
              {approvedCustomers.map(customer => (
                <TouchableOpacity
                  key={customer.id}
                  onPress={() => setInvoiceCustomerId(customer.id)}
                  style={[
                    styles.option,
                    {
                      borderColor: invoiceCustomerId === customer.id ? roleColor : colors.border,
                      backgroundColor: invoiceCustomerId === customer.id ? roleColor : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: invoiceCustomerId === customer.id ? '#fff' : colors.text }}>{customer.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Invoice period</Text>
            <View style={styles.options}>
              {(['weekly', 'monthly'] as CustomerLedgerPeriod[]).map(period => (
                <TouchableOpacity
                  key={period}
                  onPress={() => setInvoicePeriod(period)}
                  style={[
                    styles.option,
                    {
                      borderColor: invoicePeriod === period ? roleColor : colors.border,
                      backgroundColor: invoicePeriod === period ? roleColor : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: invoicePeriod === period ? '#fff' : colors.text, textTransform: 'capitalize' }}>{period}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={invoiceAnchorDate} onChangeText={setInvoiceAnchorDate} placeholder="A date within the period (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
            {customerLedgerPeriodRange(invoiceAnchorDate, invoicePeriod) && (
              <Text style={[styles.hint, { color: colors.textMuted }]}>Period: {customerLedgerPeriodRange(invoiceAnchorDate, invoicePeriod)?.from} to {customerLedgerPeriodRange(invoiceAnchorDate, invoicePeriod)?.to}</Text>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => void generateInvoice()} style={[styles.actionButton, { backgroundColor: roleColor }]}>
                <Ionicons name="document-text-outline" size={16} color="#fff" />
                <Text style={styles.primaryButtonText}>Generate PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void emailInvoice()} style={[styles.actionButton, { backgroundColor: colors.success }]}>
                <Ionicons name="mail-outline" size={16} color="#fff" />
                <Text style={styles.primaryButtonText}>Email Invoice</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {(role === 'acc' || role === 'admin') && approvedCustomers.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Record Payment or Advance</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Payments reduce outstanding credit. Any excess remains available for the customer’s next purchase.</Text>
            <View style={styles.customerOptions}>
              {approvedCustomers.map(customer => (
                <TouchableOpacity
                  key={customer.id}
                  onPress={() => setPaymentCustomerId(customer.id)}
                  style={[
                    styles.option,
                    {
                      borderColor: paymentCustomerId === customer.id ? roleColor : colors.border,
                      backgroundColor: paymentCustomerId === customer.id ? roleColor : colors.surface,
                    },
                  ]}
                >
                  <Text style={{ color: paymentCustomerId === customer.id ? '#fff' : colors.text }}>{customer.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="Amount paid or deposited" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
            <TextInput value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
            <TextInput value={paymentReference} onChangeText={setPaymentReference} placeholder="Receipt or bank reference" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
            <TouchableOpacity onPress={recordCustomerPayment} style={[styles.primaryButton, { backgroundColor: roleColor }]}>
              <Text style={styles.primaryButtonText}>Record Payment</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 20 }} />
      </KeyboardAwareScrollViewCompat>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12 },
  hero: { borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800' },
  heroText: { color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 17, marginTop: 3 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 9 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 9, padding: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  customerOptions: { gap: 7 },
  option: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  primaryButton: { borderRadius: 9, padding: 11, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  count: { minWidth: 25, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  empty: { borderRadius: 14, borderWidth: 1, padding: 22, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  profileIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  customerName: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 11, marginTop: 2 },
  status: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  balanceBox: { padding: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: 11, fontWeight: '600' },
  balanceValue: { fontSize: 15, fontWeight: '800' },
  detailsBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 3 },
  detailText: { fontSize: 11, lineHeight: 16 },
  historyTitle: { fontSize: 12, fontWeight: '800' },
  purchaseRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, gap: 8 },
  purchaseProduct: { fontSize: 12, fontWeight: '700' },
  purchaseAmount: { fontSize: 12, fontWeight: '800' },
  editButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: 8, padding: 10, alignItems: 'center', justifyContent: 'center' },
});
