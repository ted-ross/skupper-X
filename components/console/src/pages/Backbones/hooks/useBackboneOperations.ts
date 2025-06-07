import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import { QueriesBackbones } from '../Backbones.enum';

export const useBackboneOperations = () => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: backbones } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetBackbones],
    queryFn: () => RESTApi.fetchBackbones()
  });

  const mutationDeleteBackbone = useMutation({
    mutationFn: (backboneId: string) => RESTApi.deleteBackbone(backboneId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetBackbones] });
    }
  });

  const mutationActivateBackbone = useMutation({
    mutationFn: (backboneId: string) => RESTApi.activateBackbone(backboneId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetBackbones] });
    }
  });

  const refreshBackbones = useCallback(() => {
    // Use a more gentle refresh that doesn't cause visual glitches
    queryClient.invalidateQueries({
      queryKey: [QueriesBackbones.GetBackbones],
      exact: true,
      refetchType: 'active'
    });
  }, [queryClient]);

  const deleteBackbone = useCallback(
    (backboneId: string) => {
      mutationDeleteBackbone.mutate(backboneId);
    },
    [mutationDeleteBackbone]
  );

  const activateBackbone = useCallback(
    (backboneId: string) => {
      mutationActivateBackbone.mutate(backboneId);
    },
    [mutationActivateBackbone]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    backbones,
    error,
    deleteBackbone,
    activateBackbone,
    refreshBackbones,
    clearError,
    isDeleting: mutationDeleteBackbone.isPending,
    isActivating: mutationActivateBackbone.isPending
  };
};
