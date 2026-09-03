import React, { forwardRef, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('react-native', () => ({
  Modal: 'Modal',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default ?? options.native,
  },
  TurboModuleRegistry: {
    get: jest.fn(() => null),
    getEnforcing: jest.fn(() => null),
  },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/components/FormSheet', () => ({ ModalSheet: 'ModalSheet' }));
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#fff',
    border: '#ddd',
    primary: '#075e2d',
    surface: '#fff',
    text: '#111',
    textMuted: '#666',
    textSubtle: '#999',
    warning: '#a65c00',
    warningBg: '#fff3d6',
  }),
}));

import { useBusinessDateConfirmation } from './BusinessDateConfirmation';

type ConfirmationHandle = ReturnType<typeof useBusinessDateConfirmation>;
type ConfirmationElementProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const Harness = forwardRef<ConfirmationHandle>((_, ref) => {
  const confirmation = useBusinessDateConfirmation();
  useImperativeHandle(ref, () => confirmation, [confirmation]);
  return null;
});

describe('useBusinessDateConfirmation', () => {
  it('does not run a pending action when cancelled and runs it once when confirmed', () => {
    const ref = React.createRef<ConfirmationHandle>();
    act(() => {
      create(<Harness ref={ref} />);
    });
    let calls = 0;

    act(() => {
      ref.current?.requestDateConfirmation('expense', '2026-08-27', () => {
        calls += 1;
      }, 'Confirm & save');
    });

    const pendingModal = ref.current?.confirmationModal as React.ReactElement<ConfirmationElementProps>;
    expect(pendingModal.props.visible).toBe(true);
    act(() => pendingModal.props.onCancel());
    expect(calls).toBe(0);
    expect((ref.current?.confirmationModal as React.ReactElement<ConfirmationElementProps>).props.visible).toBe(false);

    act(() => {
      ref.current?.requestDateConfirmation('expense', '2026-08-27', () => {
        calls += 1;
      }, 'Confirm & save');
    });
    const confirmedModal = ref.current?.confirmationModal as React.ReactElement<ConfirmationElementProps>;
    act(() => confirmedModal.props.onConfirm());
    expect(calls).toBe(1);
    act(() => confirmedModal.props.onConfirm());
    expect(calls).toBe(1);
  });
});