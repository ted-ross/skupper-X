import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError, MemberSiteResponse } from '../../../API/REST.interfaces';
import { QueriesVans } from '../Vans.enum';

export const useVanSiteOperations = (vanId: string) => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: vanSites } = useSuspenseQuery<MemberSiteResponse[]>({
    queryKey: [QueriesVans.GetVanMembers, vanId],
    queryFn: () => RESTApi.fetchMembers(vanId)
  });

  const mutationEvictMember = useMutation({
    mutationFn: (memberId: string) => RESTApi.evictMember(memberId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanMembers, vanId] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const refreshVanSites = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVanMembers, vanId] });
  }, [queryClient, vanId]);

  const evictMember = useCallback(
    (memberId: string) => {
      mutationEvictMember.mutate(memberId);
    },
    [mutationEvictMember]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    vanSites,
    error,
    evictMember,
    refreshVanSites,
    clearError,
    isEvicting: mutationEvictMember.isPending
  };
};
