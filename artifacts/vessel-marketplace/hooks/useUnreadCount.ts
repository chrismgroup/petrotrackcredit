import { useQuery } from '@tanstack/react-query';
import { vmNotifications } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function useUnreadCount(): number {
  const { isAuthenticated } = useAuth();

  const { data } = useQuery({
    queryKey: ['vessel-notifications'],
    queryFn: async () => {
      const { data } = await vmNotifications.list();
      return data ?? [];
    },
    enabled: isAuthenticated,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  return data?.filter(n => !n.read).length ?? 0;
}
