import { useCallback } from 'react';

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { VanResponse } from '../../../API/REST.interfaces';
import { QueriesVans } from '../Vans.enum';

export const useVanDetails = (vanId: string) => {
  const queryClient = useQueryClient();

  const { data: van } = useSuspenseQuery<VanResponse>({
    queryKey: [QueriesVans.GetVan, vanId],
    queryFn: () => RESTApi.searchVan(vanId)
  });

  const refreshVan = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVan, vanId] });
  }, [queryClient, vanId]);

  return {
    van,
    refreshVan
  };
};
