import { useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LibraryBlockResponse } from '../../../API/REST.interfaces';
import { QueriesLibraries } from '../Libraries.enum';

export const useLibraryDetails = (libraryId: string) => {
  const {
    data: library,
    isLoading,
    error
  } = useSuspenseQuery<LibraryBlockResponse>({
    queryKey: [QueriesLibraries.GetLibraryBlock, libraryId],
    queryFn: () => RESTApi.fetchLibraryBlock(libraryId)
  });

  return {
    library,
    isLoading,
    error
  };
};
