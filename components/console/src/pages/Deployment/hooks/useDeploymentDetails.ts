import { useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { DeploymentDetailsResponse } from '../../../API/REST.interfaces';
import { QueriesDeployment } from '../Deployments.enum';

export const useDeploymentDetails = (deploymentId: string) => {
  const {
    data: deployment,
    isLoading,
    error
  } = useSuspenseQuery<DeploymentDetailsResponse>({
    queryKey: [QueriesDeployment.GetDeployment, deploymentId],
    queryFn: () => RESTApi.fetchDeploymentDetails(deploymentId)
  });

  return {
    deployment,
    isLoading,
    error
  };
};
