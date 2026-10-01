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
 *     Pressable  flex:1  ← fills space ABOVE the sheet; tapping it closes the sheet
 *     children           ← sheet card sits at the bottom in normal flow
 *
 * No KeyboardAvoidingView here. The app uses native iOS/Android keyboard
 * handling (softwareKeyboardLayoutMode:"resize" on Android) together with
 * KeyboardAwareScrollViewCompat inside forms that can extend behind the keyboard.
 * Adding KAV inside Modal causes the keyboard to flip on every keystroke.
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
