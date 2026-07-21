import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Colors } from '@/constants/colors';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: Colors.navy },
                    headerTintColor: Colors.textInverse,
                    headerTitleStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
                    headerShown: false,
                    contentStyle: { backgroundColor: Colors.background },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="vessel/[id]" options={{ headerShown: true, title: 'Vessel Details', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                  <Stack.Screen name="vessel/add" options={{ headerShown: true, title: 'Add Vessel', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                  <Stack.Screen name="vessel/edit/[id]" options={{ headerShown: true, title: 'Edit Vessel', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                  <Stack.Screen name="charter/[id]" options={{ headerShown: true, title: 'Charter Details', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                  <Stack.Screen name="charter/new/[vesselId]" options={{ headerShown: true, title: 'Charter Enquiry', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                  <Stack.Screen name="auth/login" options={{ headerShown: true, title: 'Sign In', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                  <Stack.Screen name="auth/register" options={{ headerShown: true, title: 'Create Account', headerStyle: { backgroundColor: Colors.navy }, headerTintColor: Colors.textInverse }} />
                </Stack>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
