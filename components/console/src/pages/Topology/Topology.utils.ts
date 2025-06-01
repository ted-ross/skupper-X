import { BackboneResponse, BackboneSiteResponse, LinkResponse, AccessPointResponse } from '../../API/REST.interfaces';

// Access point badge data
export interface AccessPointBadge {
  type: 'claim' | 'peer' | 'member' | 'manage';
  count: number;
  color: string;
}

// G6 Graph node interface (compatible with G6's NodeData)
export interface TopologyNode {
  id: string;
  type?: string;
  combo?: string; // For assigning nodes to combos (G6 standard field)
  data?: {
    label: string;
    nodeType: 'backbone' | 'site';
    lifecycle?: string;
    platform?: string;
    deploymentState?: string;
    accessPointBadges?: AccessPointBadge[];
  };
  style?: {
    x?: number;
    y?: number;
    size?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };
  // Index signature to make it compatible with G6 NodeData
  [key: string]: any;
}

// G6 Graph edge interface (compatible with G6's EdgeData)
export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: {
    label?: string;
    edgeType: 'backbone-site' | 'link';
    cost?: number;
    accessPointKind?: string;
    accessPointName?: string;
    linkDirection?: 'single' | 'forward' | 'reverse';
  };
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
  // Index signature to make it compatible with G6 EdgeData
  [key: string]: any;
}

// G6 Graph combo interface (compatible with G6's ComboData)
export interface TopologyCombo {
  id: string;
  label: string;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    radius?: number;
  };
  // Index signature to make it compatible with G6 ComboData
  [key: string]: any;
}

// G6 Graph data interface
export interface TopologyGraphData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  combos: TopologyCombo[];
}

// Extended site interface with backbone info
export interface ExtendedSite extends BackboneSiteResponse {
  backboneId: string;
  backboneName: string;
}

// Topology data interface
export interface TopologyData {
  backbones: BackboneResponse[];
  sites: ExtendedSite[];
  links: LinkResponse[];
  accessPoints: AccessPointResponse[];
}

/**
 * Get badge color based on access point type
 */
const getAccessPointBadgeColor = (type: 'claim' | 'peer' | 'member' | 'manage'): string => {
  switch (type) {
    case 'claim':
      return '#1890ff'; // Blue
    case 'peer':
      return '#fa8c16'; // Orange
    case 'member':
      return '#13c2c2'; // Cyan/Teal
    case 'manage':
      return '#722ed1'; // Purple
    default:
      console.warn(`Unknown access point type: "${type}", using gray fallback`);
      return '#d9d9d9'; // Gray fallback
  }
};

/**
 * Group access points by site and type, excluding ones used in links
 */
const createAccessPointBadges = (
  accessPoints: AccessPointResponse[],
  usedAccessPointIds: Set<string>
): Map<string, AccessPointBadge[]> => {
  const siteAccessPoints = new Map<string, Map<string, number>>();

  // Group unused access points by site and type
  accessPoints.forEach((ap) => {
    if (!usedAccessPointIds.has(ap.id)) {
      const siteId = `site-${ap.interiorsite}`;

      if (!siteAccessPoints.has(siteId)) {
        siteAccessPoints.set(siteId, new Map());
      }

      const siteMap = siteAccessPoints.get(siteId)!;
      const currentCount = siteMap.get(ap.kind) || 0;
      siteMap.set(ap.kind, currentCount + 1);
    }
  });

  // Convert to badge format
  const siteBadges = new Map<string, AccessPointBadge[]>();
  siteAccessPoints.forEach((typeMap, siteId) => {
    const badges: AccessPointBadge[] = [];
    typeMap.forEach((count, type) => {
      const badge = {
        type: type as 'claim' | 'peer' | 'member' | 'manage',
        count,
        color: getAccessPointBadgeColor(type as 'claim' | 'peer' | 'member' | 'manage')
      };
      badges.push(badge);
    });

    // Sort badges by type for consistent positioning
    badges.sort((a, b) => a.type.localeCompare(b.type));
    siteBadges.set(siteId, badges);
  });

  return siteBadges;
};

/**
 * Transform topology data into G6 graph format
 */
export const transformTopologyData = (topologyData: TopologyData | undefined): TopologyGraphData => {
  if (!topologyData) {
    return { nodes: [], edges: [], combos: [] };
  }

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const combos: TopologyCombo[] = [];

  // Create a lookup map for access points by their ID
  const accessPointMap = new Map<string, AccessPointResponse>();
  topologyData.accessPoints.forEach((ap) => {
    accessPointMap.set(ap.id, ap);
  });

  // Track which access points are used in links
  const usedAccessPointIds = new Set<string>();

  // Create combos for backbones (instead of backbone nodes)
  topologyData.backbones.forEach((backbone) => {
    const backboneCombo: TopologyCombo = {
      id: `backbone-${backbone.id}`,
      label: backbone.name,
      style: {
        fill: 'rgba(0, 102, 204, 0.1)', // Light blue background
        stroke: '#0066cc', // Blue border
        strokeWidth: 2,
        radius: 8
      }
    };
    combos.push(backboneCombo);
  });

  // Add site nodes and assign them to their backbone combos
  topologyData.sites.forEach((site) => {
    const siteId = `site-${site.id}`;
    const siteNode: TopologyNode = {
      id: siteId,
      data: {
        label: site.name,
        nodeType: 'site',
        platform: site.targetplatform,
        lifecycle: site.lifecycle,
        deploymentState: site.deploymentstate
      }
    };

    // Assign site to its backbone combo
    if (site.backboneId) {
      siteNode.combo = `backbone-${site.backboneId}`;
    }

    nodes.push(siteNode);
  });

  // Create direct links between sites (no access point nodes)
  // First, collect all links to determine directions
  const linkDirections = new Map<string, Set<string>>();

  topologyData.links.forEach((link) => {
    const connectingSiteId = `site-${link.connectinginteriorsite}`;
    const accessPoint = accessPointMap.get(link.accesspoint);
    if (!accessPoint) return;

    const destinationSiteId = `site-${accessPoint.interiorsite}`;
    if (connectingSiteId === destinationSiteId) return; // Skip self-links

    // Mark this access point as used
    usedAccessPointIds.add(link.accesspoint);

    const siteKey = [connectingSiteId, destinationSiteId].sort().join('-');
    if (!linkDirections.has(siteKey)) {
      linkDirections.set(siteKey, new Set());
    }
    linkDirections.get(siteKey)!.add(`${connectingSiteId}->${destinationSiteId}`);
  });

  topologyData.links.forEach((link) => {
    const connectingSiteId = `site-${link.connectinginteriorsite}`;

    // Get access point information
    const accessPoint = accessPointMap.get(link.accesspoint);
    if (!accessPoint) {
      console.warn(`Access point ${link.accesspoint} not found for link ${link.id}`);
      return;
    }

    const destinationSiteId = `site-${accessPoint.interiorsite}`;
    const accessPointKind = accessPoint.kind;
    const accessPointName = accessPoint.name;

    // Skip if connecting site and destination site are the same (self-links)
    if (connectingSiteId === destinationSiteId) {
      return;
    }

    // Determine direction and color
    const siteKey = [connectingSiteId, destinationSiteId].sort().join('-');
    const directions = linkDirections.get(siteKey)!;
    const isForward = connectingSiteId < destinationSiteId;
    const linkDirection = directions.size > 1 ? (isForward ? 'forward' : 'reverse') : 'single';

    // Create direct edge from connecting site to destination site
    const directEdge: TopologyEdge = {
      id: `edge-${connectingSiteId}-to-${destinationSiteId}-link-${link.id}`,
      source: connectingSiteId,
      target: destinationSiteId,
      data: {
        label: link.cost > 0 ? `cost: ${link.cost}` : '',
        edgeType: 'link',
        cost: link.cost,
        accessPointKind,
        accessPointName,
        linkDirection
      }
    };
    edges.push(directEdge);
  });

  // Create access point badges for unused access points
  const siteBadges = createAccessPointBadges(topologyData.accessPoints, usedAccessPointIds);

  // Add badges to site nodes
  nodes.forEach((node) => {
    if (node.data?.nodeType === 'site') {
      const badges = siteBadges.get(node.id);
      if (badges && badges.length > 0) {
        node.data.accessPointBadges = badges;
      }
    }
  });

  const result = { nodes, edges, combos };

  // Debug logging
  console.log('Topology transformation result:', {
    combos: combos.length,
    nodes: nodes.length,
    edges: edges.length,
    comboDetails: combos.map((c) => ({ id: c.id, label: c.label })),
    nodeComboAssignments: nodes.filter((n) => n.combo).map((n) => ({ id: n.id, combo: n.combo }))
  });

  return result;
};

/**
 * Check if topology data is empty
 */
export const isTopologyDataEmpty = (topologyData: TopologyData | undefined): boolean => {
  if (!topologyData) return true;
  return topologyData.backbones.length === 0 && topologyData.sites.length === 0;
};
