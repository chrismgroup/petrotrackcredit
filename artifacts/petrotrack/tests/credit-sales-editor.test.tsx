import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';

import { CreditSalesEditor } from '@/components/CreditSalesEditor';
import type { CreditCustomer, CreditSaleDraft } from '@/lib/customer-ledger';

jest.mock('react-native', () => {
  const React = require('react');
  const primitive = (name: string) => ({ children, ...props }: any) =>
    React.createElement(name, props, children);
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    Text: primitive('Text'),
    TextInput: primitive('TextInput'),
    TouchableOpacity: primitive('TouchableOpacity'),
    View: primitive('View'),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/hooks/useColors', () => ({
  useColors: () => new Proxy({}, { get: () => '#123456' }),
}));

const customer = (id: string, name: string): CreditCustomer => ({
  id, name, phone: '0800', branchId: 'B1', status: 'approved',
  createdBy: 'Accountant', createdAt: '2026-10-01T00:00:00Z', revision: 1,
});
const customers = [customer('IBOM', 'Ibom Air'), customer('TULCAN', 'Tulcan')];

function Harness({ onDrafts }: { onDrafts: (drafts: CreditSaleDraft[]) => void }) {
  const [drafts, setDrafts] = React.useState<CreditSaleDraft[]>([]);
  return (
    <CreditSalesEditor
      customers={customers}
      drafts={drafts}
      onChange={next => { setDrafts(next); onDrafts(next); }}
      unitPrice={1_000}
      unit="L"
      accent="#000"
      balanceFor={id => (id === 'IBOM' ? 25_000 : 0)}
    />
  );
}

const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

describe('CreditSalesEditor', () => {
  it('records two approved customers in the same shift report', () => {
    let latest: CreditSaleDraft[] = [];
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<Harness onDrafts={drafts => { latest = drafts; }} />); });
    const byId = (id: string) => tree.root.findByProps({ testID: id });

    expect(tree.root.findAllByProps({ testID: 'shift-credit-options' })).toHaveLength(0);
    act(() => byId('shift-credit-dropdown').props.onPress());
    act(() => byId('shift-credit-customer-IBOM').props.onPress());
    // Picking closes the list, and an added customer is not offered again.
    expect(tree.root.findAllByProps({ testID: 'shift-credit-options' })).toHaveLength(0);
    act(() => byId('shift-credit-dropdown').props.onPress());
    expect(tree.root.findAllByProps({ testID: 'shift-credit-customer-IBOM' })).toHaveLength(0);
    act(() => byId('shift-credit-customer-TULCAN').props.onPress());
    expect(text(tree)).toContain('All approved customers have been added.');
    act(() => byId('shift-credit-quantity-IBOM').props.onChangeText('100'));
    act(() => byId('shift-credit-quantity-TULCAN').props.onChangeText('50'));

    expect(latest).toEqual([
      { customerId: 'IBOM', quantity: '100' },
      { customerId: 'TULCAN', quantity: '50' },
    ]);
    const output = text(tree);
    expect(output).toContain('Outstanding after this sale: ');
    expect(output).toContain('2 customers · 150 L');
    expect(output).toContain('₦150,000');
    expect(byId('shift-credit-total')).toBeTruthy();

    act(() => byId('shift-credit-remove-IBOM').props.onPress());
    expect(latest).toEqual([{ customerId: 'TULCAN', quantity: '50' }]);
    expect(tree.root.findAllByProps({ testID: 'shift-credit-total' })).toHaveLength(0);
  });

  it('searches long customer lists', () => {
    const many = Array.from({ length: 8 }, (_, index) => customer(`C${index}`, `Customer ${index}`))
      .concat(customer('IBOM', 'Ibom Air'));
    const onChange = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <CreditSalesEditor customers={many} drafts={[]} onChange={onChange} unitPrice={1_000} unit="L" accent="#000" />,
      );
    });
    act(() => tree.root.findByProps({ testID: 'shift-credit-dropdown' }).props.onPress());
    act(() => tree.root.findByProps({ testID: 'shift-credit-search' }).props.onChangeText('ibom'));
    const options = tree.root.findAll(node => typeof node.props.testID === 'string'
      && node.props.testID.startsWith('shift-credit-customer-') && (node.type as unknown) === 'TouchableOpacity');
    expect(options.map(node => node.props.testID)).toEqual(['shift-credit-customer-IBOM']);
    act(() => options[0].props.onPress());
    expect(onChange).toHaveBeenCalledWith([{ customerId: 'IBOM', quantity: '' }]);
  });

  it('only offers the approved customers it is given', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <CreditSalesEditor customers={[]} drafts={[]} onChange={jest.fn()} unitPrice={1_000} unit="L" accent="#000" />,
      );
    });
    expect(text(tree)).toContain('No MD-approved credit customer is available');
  });
});
