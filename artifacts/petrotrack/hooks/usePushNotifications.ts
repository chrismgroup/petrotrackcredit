import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useApp } from '@/context/AppContext';
import { notificationsApi } from '@/lib/api';
import { safeNotificationRoute } from '@/lib/navigation-routing';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const router = useRouter();
  const { isServerAuthenticated, refreshNotifications } = useApp();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isServerAuthenticated) {
      registeredRef.current = false;
      return;
    }

    let disposed = false;
    const register = async () => {
      if (Platform.OS === 'web' || registeredRef.current) return;
      try {
        const permissions = await Notifications.getPermissionsAsync();
        let status = permissions.status;
        if (
          status !== Notifications.PermissionStatus.GRANTED &&
          permissions.canAskAgain !== false
        ) {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== Notifications.PermissionStatus.GRANTED || disposed) return;

        await Notifications.setNotificationChannelAsync('petrotrack-alerts', {
          name: 'Petrotrack alerts',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await notificationsApi.registerToken(token, Platform.OS);
        registeredRef.current = true;
      } catch {
        // Physical-device push setup is unavailable in some simulators and web previews.
        // The durable inbox and foreground polling continue to work in those environments.
      }
    };

    void register();
    const received = Notifications.addNotificationReceivedListener(() => {
      void refreshNotifications();
    });
    const response = Notifications.addNotificationResponseReceivedListener(response => {
      const route = response.notification.request.content.data?.route;
      router.push(safeNotificationRoute(route) as never);
      void refreshNotifications();
    });

    return () => {
      disposed = true;
      received.remove();
      response.remove();
    };
  }, [isServerAuthenticated, refreshNotifications, router]);
}
