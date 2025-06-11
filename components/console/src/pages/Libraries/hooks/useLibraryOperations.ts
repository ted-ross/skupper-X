import { useCallback, useState } from 'react';

import { useMutation, useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import { QueriesLibraries } from '../Libraries.enum';

export const useLibraryOperations = () => {
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: libraries } = useSuspenseQuery({
    queryKey: [QueriesLibraries.GetLibraries],
    queryFn: () => RESTApi.fetchLibraries()
  });

  const mutationDeleteLibrary = useMutation({
    mutationFn: (libraryId: string) => RESTApi.deleteLibrary(libraryId),
    onError: (data: HTTPError) => {
      setError(data.descriptionMessage);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueriesLibraries.GetLibraries] });
    },
    onMutate: () => {
      setError(undefined);
    }
  });

  const deleteLibrary = useCallback(
    (libraryId: string) => {
      mutationDeleteLibrary.mutate(libraryId);
    },
    [mutationDeleteLibrary]
  );

  const refreshLibraries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesLibraries.GetLibraries] });
  }, [queryClient]);

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    libraries,
    error,
    deleteLibrary,
    refreshLibraries,
    clearError,
    isDeleting: mutationDeleteLibrary.isPending
  };
};
