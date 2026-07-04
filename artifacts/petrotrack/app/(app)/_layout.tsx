import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useApp } from '@/context/AppContext';

export default function AppLayout() {
  const { role } = useApp();

  if (!role) {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}
