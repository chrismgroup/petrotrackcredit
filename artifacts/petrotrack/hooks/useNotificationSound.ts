import { useAudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef } from 'react';

import { useApp } from '@/context/AppContext';

const notificationSound = require('../assets/sounds/notification.wav');

export function useNotificationSound() {
  const { messages } = useApp();
  const player = useAudioPlayer(notificationSound);
  const prevCountRef = useRef(-1);

  const totalUnread = useMemo(
    () =>
      Object.values(messages).reduce(
        (sum, msgs) =>
          sum + (Array.isArray(msgs) ? msgs.filter(m => !m.read).length : 0),
        0
      ),
    [messages]
  );

  useEffect(() => {
    if (prevCountRef.current === -1) {
      prevCountRef.current = totalUnread;
      return;
    }
    if (totalUnread > prevCountRef.current) {
      try {
        player.seekTo(0);
        player.play();
      } catch {
        // silently ignore if audio is unavailable
      }
    }
    prevCountRef.current = totalUnread;
  }, [totalUnread, player]);
}
