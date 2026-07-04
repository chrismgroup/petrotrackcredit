import { Redirect, Stack } from 'expo-router';
import React from 'react';

import { useApp } from '@/context/AppContext';
import { useNotifications } from '@/hooks/useNotifications';

function NotificationRunner() {
  useNotifications();
  return null;
}

export default function AppLayout() {
  const { role } = useApp();

  if (!role) {
    return <Redirect href="/" />;
  }

  return (
    <>
      <NotificationRunner />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
