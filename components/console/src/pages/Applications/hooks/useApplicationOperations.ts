import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import { QueriesApplications } from '../Applications.enum';

export const useApplicationOperations = () => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: applications } = useSuspenseQuery({
    queryKey: [QueriesApplications.GetApplications],
    queryFn: async () => {
      console.log('fetchApplications called');
      const result = await RESTApi.fetchApplications();
      console.log('fetchApplications result:', result);
      return result;
    }
  });

  const mutationDeleteApplication = useMutation({
    mutationFn: (applicationId: string) => RESTApi.deleteApplication(applicationId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesApplications.GetApplications] });
    }
  });

  const mutationBuildApplication = useMutation({
    mutationFn: (applicationId: string) => RESTApi.buildApplication(applicationId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesApplications.GetApplications] });
    }
  });

  const refreshApplications = useCallback(() => {
    // Use a more gentle refresh that doesn't cause visual glitches
    queryClient.invalidateQueries({
      queryKey: [QueriesApplications.GetApplications],
      exact: true,
      refetchType: 'active'
    });
  }, [queryClient]);

  const deleteApplication = useCallback(
    (applicationId: string) => {
      mutationDeleteApplication.mutate(applicationId);
    },
    [mutationDeleteApplication]
  );

  const buildApplication = useCallback(
    (applicationId: string) => {
      mutationBuildApplication.mutate(applicationId);
    },
    [mutationBuildApplication]
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    applications,
    error,
    deleteApplication,
    buildApplication,
    refreshApplications,
    clearError,
    isDeleting: mutationDeleteApplication.isPending,
    isBuilding: mutationBuildApplication.isPending
  };
};
