import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { LinkResponse, BackboneSiteResponse, AccessPointResponse } from '../../../API/REST.interfaces';
import { TopologyData } from '../Topology.utils';

import { QueriesTopology } from '../Topology.enum';

/**
 * Custom hook to fetch all topology data (backbones, sites, and links)
 */
export const useTopologyData = () => {
  return useQuery({
    queryKey: [QueriesTopology.GetTopologyData],
    queryFn: async (): Promise<TopologyData> => {
      // First fetch all backbones
      const backbones = await RESTApi.fetchBackbones();

      // Then fetch sites and links for each backbone
      const allSites: (BackboneSiteResponse & { backboneId: string; backboneName: string })[] = [];
      const allLinks: LinkResponse[] = [];
      const allAccessPoints: AccessPointResponse[] = [];

      for (const backbone of backbones) {
        try {
          const [sites, links, accessPoints] = await Promise.all([
            RESTApi.fetchSites(backbone.id),
            RESTApi.fetchLinksForBackbone(backbone.id),
            RESTApi.fetchAccessPointsForBackbone(backbone.id)
          ]);

          // Add backbone reference to each site for grouping
          const sitesWithBackbone = sites.map((site) => ({
            ...site,
            backboneId: backbone.id,
            backboneName: backbone.name
          }));

          // Add backbone reference to each link
          const linksWithBackbone = links.map((link) => ({
            ...link,
            backboneId: backbone.id,
            backboneName: backbone.name
          }));

          allSites.push(...sitesWithBackbone);
          allLinks.push(...linksWithBackbone);
          allAccessPoints.push(...accessPoints);
        } catch (error) {
          console.warn(`Failed to fetch data for backbone ${backbone.name}:`, error);
        }
      }

      return {
        backbones,
        sites: allSites,
        links: allLinks,
        accessPoints: allAccessPoints
      };
    }
  });
};
