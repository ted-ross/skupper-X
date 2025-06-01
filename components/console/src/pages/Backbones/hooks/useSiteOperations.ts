import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import { QueriesBackbones } from '../Backbones.enum';

export const useSiteOperations = (bid: string) => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: sites } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetSites, bid],
    queryFn: () => RESTApi.fetchSites(bid)
  });

  const mutationDeleteSite = useMutation({
    mutationFn: (siteId: string) => RESTApi.deleteSite(siteId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetSites, bid] });
    }
  });

  const refreshSites = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetSites, bid] });
  }, [queryClient, bid]);

  const deleteSite = useCallback(
    (siteId: string) => {
      mutationDeleteSite.mutate(siteId);
    },
    [mutationDeleteSite]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    sites,
    error,
    deleteSite,
    refreshSites,
    clearError,
    isDeleting: mutationDeleteSite.isPending
  };
};
