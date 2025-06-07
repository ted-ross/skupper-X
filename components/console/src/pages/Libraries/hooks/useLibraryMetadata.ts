import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { QueriesLibraries } from '../Libraries.enum';

export const useLibraryMetadata = () => {
  const { data: blockTypes = [], isLoading: blockTypesLoading } = useQuery({
    queryKey: [QueriesLibraries.GetBlockTypes],
    queryFn: () => RESTApi.fetchLibraryBlockTypes(),
  });

  const { data: bodyStyles = [], isLoading: bodyStylesLoading } = useQuery({
    queryKey: [QueriesLibraries.GetBodyStyles],
    queryFn: () => RESTApi.fetchLibraryBodyStyles(),
  });

  return {
    blockTypes,
    bodyStyles,
    isLoading: blockTypesLoading || bodyStylesLoading
  };
};
