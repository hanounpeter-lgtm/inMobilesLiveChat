import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface DirectoryUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  email: string;
}

/** Workspace directory, always warm — mention rendering needs display names. */
export function useUsersById(): Record<string, string> {
  const query = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ users: DirectoryUser[] }>('/users'),
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => Object.fromEntries((query.data?.users ?? []).map((u) => [u.id, u.displayName])),
    [query.data],
  );
}
