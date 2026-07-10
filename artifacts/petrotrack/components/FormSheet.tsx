import React from 'react';
import {
  KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet,
} from 'react-native';

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Keyboard-safe modal bottom sheet.
 *
 * Layout (flex column, top→bottom):
 *   KeyboardAvoidingView  flex:1
 *     Pressable           flex:1  ← expands to fill space ABOVE the sheet only
 *     children                    ← sheet card, sits at the bottom in normal flow
 *
 * The Pressable does NOT use absoluteFillObject, so it never sits behind the sheet
 * content. This prevents backdrop taps from also firing when the user taps a
 * TextInput, which was causing the keyboard to dismiss on every keystroke.
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
