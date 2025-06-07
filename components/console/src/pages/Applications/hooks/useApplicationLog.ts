import { useQuery } from '@tanstack/react-query';
import { RESTApi } from '../../../API/REST.api';

export const QueriesApplications = {
  GetApplicationLog: 'getApplicationLog'
} as const;

export const useApplicationLog = (applicationId: string | null) => {
  return useQuery({
    queryKey: [QueriesApplications.GetApplicationLog, applicationId],
    queryFn: () => RESTApi.fetchApplicationLog(applicationId!),
    enabled: !!applicationId
  });
};
