import { createAudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef } from 'react';

import { useApp } from '@/context/AppContext';

const notificationSound = require('../assets/sounds/notification.wav');

export function useNotificationSound() {
  const { notifications } = useApp();
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const prevCountRef = useRef(-1);

  useEffect(() => {
    try {
      playerRef.current = createAudioPlayer(notificationSound);
    } catch {
      playerRef.current = null;
    }
    return () => {
      try {
        playerRef.current?.remove();
      } catch {
        // ignore cleanup errors
      }
    };
  }, []);

  const unreadNotifications = useMemo(
    () => notifications.filter(item => !item.read).length,
    [notifications],
  );
  const alertCount = unreadNotifications;

  useEffect(() => {
    if (prevCountRef.current === -1) {
      prevCountRef.current = alertCount;
      return;
    }
    if (alertCount > prevCountRef.current && playerRef.current) {
      try {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      } catch {
        // silently ignore if audio is unavailable
      }
    }
    prevCountRef.current = alertCount;
  }, [alertCount]);
}
