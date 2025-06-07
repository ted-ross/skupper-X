// useLibraryBody hook for fetching library body data
import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LibraryBlockUpdateRequest } from '../../../API/REST.interfaces';
import { QueriesLibraries } from '../Libraries.enum';

export const useLibraryBody = (libraryId: string) => {
  const {
    data: bodyData,
    isLoading,
    error,
    refetch
  } = useQuery<LibraryBlockUpdateRequest>({
    queryKey: [QueriesLibraries.GetLibraryBody, libraryId],
    queryFn: () => RESTApi.fetchLibraryBody(libraryId),
    enabled: !!libraryId
  });

  return {
    bodyData,
    isLoading,
    error,
    refetch
  };
};
