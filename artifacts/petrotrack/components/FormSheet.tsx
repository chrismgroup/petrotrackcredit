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
 * Keyboard-safe modal bottom sheet for forms.
 *
 * Fixes:
 *  1. animationType="none"  — eliminates keyboard flicker caused by "slide" animation competing
 *                             with the iOS keyboard slide-up animation.
 *  2. KeyboardAvoidingView  — automatically pushes sheet content above the keyboard on both
 *                             iOS (padding) and Android (height).
 *  3. Pressable backdrop    — dismisses on outside tap without swallowing inner touches.
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
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
        pointerEvents="box-none"
      >
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
