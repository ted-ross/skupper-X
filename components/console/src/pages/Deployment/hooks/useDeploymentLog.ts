import { useQuery } from '@tanstack/react-query';
import { RESTApi } from '../../../API/REST.api';

export const QueriesDeployments = {
  GetDeploymentLog: 'getDeploymentLog'
} as const;

export const useDeploymentLog = (deploymentId: string | null) => {
  return useQuery({
    queryKey: [QueriesDeployments.GetDeploymentLog, deploymentId],
    queryFn: () => RESTApi.fetchDeploymentLog(deploymentId!),
    enabled: !!deploymentId
  });
};
