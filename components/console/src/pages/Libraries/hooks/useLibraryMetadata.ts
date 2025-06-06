import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { QueriesLibraries } from '../Libraries.enum';
import labels from '../../../core/config/labels';

export const useLibraryMetadata = () => {
  const { data: blockTypes = [], isLoading: blockTypesLoading } = useQuery({
    queryKey: [QueriesLibraries.GetBlockTypes],
    queryFn: () => RESTApi.fetchLibraryBlockTypes()
  });

  const bodyStyles = labels.config.bodyStyles;

  return {
    blockTypes,
    bodyStyles,
    isLoading: blockTypesLoading
  };
};
