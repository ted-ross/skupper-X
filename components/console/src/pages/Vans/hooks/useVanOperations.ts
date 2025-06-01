import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import labels from '../../../core/config/labels';

import { QueriesVans } from '../Vans.enum';

export const useVanOperations = () => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: vans } = useSuspenseQuery({
    queryKey: [QueriesVans.GetVans],
    queryFn: () => RESTApi.fetchVans()
  });

  const mutationDeleteVan = useMutation({
    mutationFn: (vid: string) => RESTApi.deleteVan(vid),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVans] });
    },
    onMutate: () => {
      // Clear any previous error when starting a new delete operation
      setError(undefined);
    }
  });

  const mutationEvictVan = useMutation({
    mutationFn: (vid: string) => RESTApi.evictVan(vid),
    onError: (data: HTTPError) => {
      // Handle specific evict not implemented error
      if (data.descriptionMessage === 'Network eviction not implemented') {
        setError(labels.errors.evictNotImplemented);
      } else {
        setError(data.descriptionMessage);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVans] });
    },
    onMutate: () => {
      // Clear any previous error when starting a new evict operation
      setError(undefined);
    }
  });

  const refreshVans = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVans] });
  }, [queryClient]);

  const deleteVan = useCallback(
    (vid: string) => {
      mutationDeleteVan.mutate(vid);
    },
    [mutationDeleteVan]
  );

  const evictVan = useCallback(
    (vid: string) => {
      mutationEvictVan.mutate(vid);
    },
    [mutationEvictVan]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    vans,
    error,
    deleteVan,
    evictVan,
    refreshVans,
    clearError,
    isDeleting: mutationDeleteVan.isPending,
    isEvicting: mutationEvictVan.isPending
  };
};
