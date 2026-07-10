import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useApp } from '@/context/AppContext';

export default function AppLayout() {
  const { role, isServerAuthenticated } = useApp();

  if (!role || !isServerAuthenticated) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
