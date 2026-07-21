import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reloadAppAsync } from 'expo';
import { Colors } from '@/constants/colors';

interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

function ErrorFallback({ error }: { error: Error | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error?.message || 'Unknown error'}</Text>
      <Pressable style={styles.button} onPress={() => reloadAppAsync()}>
        <Text style={styles.buttonText}>Restart App</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  message: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 32 },
  button: { backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: Colors.radius },
  buttonText: { color: Colors.textInverse, fontWeight: '600', fontSize: 16 },
});
