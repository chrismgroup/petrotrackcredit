import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Header } from '@/components/Header';
import { TabBar } from '@/components/TabBar';
import { useColors } from '@/hooks/useColors';

interface Props {
  title: string;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
  subHeader?: React.ReactNode;
}

export function ScreenLayout({ title, children, rightAction, subHeader }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={title} rightAction={rightAction} />
      {subHeader}
      <View style={styles.content}>{children}</View>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
});
