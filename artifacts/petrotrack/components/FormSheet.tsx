import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Keyboard-safe modal bottom sheet.
 *
 * Layout (flex column, top → bottom):
 *   View  flex:1
 *     Pressable  flex:1  ← expands to fill space ABOVE the sheet only
 *     children           ← sheet card, at the bottom in normal flow
 *
 * No KeyboardAvoidingView here — the root KeyboardProvider from
 * react-native-keyboard-controller manages the keyboard globally.
 * Adding KAV inside it caused the "keyboard flip" (KAV + KeyboardProvider
 * fighting each other on every keystroke).
 */
export function ModalSheet({ visible, onClose, children }: ModalSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
