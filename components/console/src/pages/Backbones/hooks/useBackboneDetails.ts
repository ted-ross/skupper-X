import { useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { BackboneResponse } from '../../../API/REST.interfaces';
import { QueriesBackbones } from '../Backbones.enum';

export interface UseBackboneDetailsReturn {
  backbone: BackboneResponse;
}

export const useBackboneDetails = function (backboneId: string): UseBackboneDetailsReturn {
  const { data: backbone } = useSuspenseQuery<BackboneResponse>({
    queryKey: [QueriesBackbones.GetBackbones, backboneId],
    queryFn: () => RESTApi.searchBackbone(backboneId)
  });

  return {
    backbone
  };
};
