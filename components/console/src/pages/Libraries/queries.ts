// queries.ts for Libraries page
import { useQuery } from '@tanstack/react-query';
import { RESTApi } from '../../API/REST.api';

export const useLibraryBody = (libraryId: string) => {
  return useQuery({
    queryKey: ['libraryBody', libraryId],
    queryFn: () => RESTApi.fetchLibraryBody(libraryId),
    enabled: !!libraryId
  });
};
