import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { vmAuth, saveToken, clearToken } from '@/lib/api';
import type { VesselUser, VesselUserRole } from '@/lib/types';

interface AuthContextType {
  user: VesselUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (data: { name: string; email: string; password: string; role: string; company?: string; phone?: string }) => Promise<string | null>;
  logout: () => Promise<void>;
  isOwnerOrAdmin: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => null,
  register: async () => null,
  logout: async () => {},
  isOwnerOrAdmin: false,
  isAdmin: false,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<VesselUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('vm_user')
      : null;
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await vmAuth.login(email, password);
    if (error || !data) return error || 'Login failed';
    await saveToken(data.token);
    setUser(data.user);
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('vm_user', JSON.stringify(data.user));
    }
    return null;
  }, []);

  const register = useCallback(async (
    formData: { name: string; email: string; password: string; role: string; company?: string; phone?: string }
  ): Promise<string | null> => {
    const { data, error } = await vmAuth.register(formData);
    if (error || !data) return error || 'Registration failed';
    await saveToken(data.token);
    setUser(data.user);
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('vm_user', JSON.stringify(data.user));
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('vm_user');
    }
  }, []);

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout,
      isOwnerOrAdmin, isAdmin,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
