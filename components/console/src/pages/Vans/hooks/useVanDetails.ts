import { useCallback } from 'react';

import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { VanResponse } from '../../../API/REST.interfaces';
import { QueriesVans } from '../Vans.enum';

export const useVanDetails = (vanId: string) => {
  const queryClient = useQueryClient();

  const { data: van } = useSuspenseQuery<VanResponse>({
    queryKey: [QueriesVans.GetVan, vanId],
    queryFn: async () => {
      // Get VAN details
      const vanData = await RESTApi.searchVan(vanId);

      // If VAN has a certificate, fetch the TLS certificate details
      if (vanData.certificate) {
        try {
          const tlsCert = await RESTApi.fetchTlsCertificate(vanData.certificate);
          // Enrich VAN data with certificate expiration and renewal time
          return {
            ...vanData,
            tlsexpiration: tlsCert.expiration,
            tlsrenewal: tlsCert.renewaltime
          };
        } catch (error) {
          // If certificate fetch fails, return VAN data without certificate details
          console.warn(`Failed to fetch TLS certificate ${vanData.certificate}:`, error);
          return vanData;
        }
      }
      // Return VAN data without certificate details if no certificate
      return vanData;
    }
  });

  const refreshVan = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueriesVans.GetVan, vanId] });
  }, [queryClient, vanId]);

  return {
    van,
    refreshVan
  };
};
