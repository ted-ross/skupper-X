import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { DeploymentRequest, HTTPError } from '../../../API/REST.interfaces';
import { QueriesDeployment } from '../Deployments.enum';

/**
 * Custom hook for deployment operations
 * Provides CRUD operations for deployments
 */
export const useDeploymentOperations = () => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: deployments } = useSuspenseQuery({
    queryKey: [QueriesDeployment.GetDeployments],
    queryFn: () => RESTApi.fetchDeployments()
  });

  const mutationCreateDeployment = useMutation({
    mutationFn: (deploymentData: DeploymentRequest) => RESTApi.createDeployment(deploymentData),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesDeployment.GetDeployments] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const mutationDeleteDeployment = useMutation({
    mutationFn: (deploymentId: string) => RESTApi.deleteDeployment(deploymentId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesDeployment.GetDeployments] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const refreshDeployments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesDeployment.GetDeployments] });
  }, [queryClient]);

  const createDeployment = useCallback(
    (deploymentData: DeploymentRequest) => {
      mutationCreateDeployment.mutate(deploymentData);
    },
    [mutationCreateDeployment]
  );

  const deleteDeployment = useCallback(
    (deploymentId: string) => {
      mutationDeleteDeployment.mutate(deploymentId);
    },
    [mutationDeleteDeployment]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    deployments,
    error,
    createDeployment,
    deleteDeployment,
    refreshDeployments,
    clearError,
    isCreating: mutationCreateDeployment.isPending,
    isDeleting: mutationDeleteDeployment.isPending
  };
};
