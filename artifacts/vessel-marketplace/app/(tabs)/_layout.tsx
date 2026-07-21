import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';

function TabIcon({ name, focused, label }: { name: React.ComponentProps<typeof Ionicons>['name']; focused: boolean; label: string }) {
  return (
    <View style={styles.tabIcon}>
      <Ionicons name={name} size={24} color={focused ? Colors.tabBarActive : Colors.tabBarInactive} />
      <Text style={[styles.tabLabel, { color: focused ? Colors.tabBarActive : Colors.tabBarInactive }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { isAdmin, isOwnerOrAdmin } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Browse',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'search' : 'search-outline'} focused={focused} label="Browse" />,
        }}
      />
      <Tabs.Screen
        name="charters"
        options={{
          title: 'Charters',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'document-text' : 'document-text-outline'} focused={focused} label="Charters" />,
        }}
      />
      <Tabs.Screen
        name="vessels"
        options={isOwnerOrAdmin ? {
          title: 'My Vessels',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'boat' : 'boat-outline'} focused={focused} label="Vessels" />,
        } : { href: null }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'notifications' : 'notifications-outline'} focused={focused} label="Alerts" />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={isAdmin ? {
          title: 'Admin',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'shield' : 'shield-outline'} focused={focused} label="Admin" />,
        } : { href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} label="Profile" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBar,
    borderTopColor: Colors.tabBarBorder,
    borderTopWidth: 1,
    height: Platform.OS === 'web' ? 84 : 70,
    paddingBottom: Platform.OS === 'web' ? 34 : 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.2,
  },
});
