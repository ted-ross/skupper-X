// Route tree-based breadcrumb configuration
export interface BreadcrumbRouteNode {
  segment: string;
  displayName?: string;
  isRoutingArtifact?: boolean;
  children?: BreadcrumbRouteNode[];
}

export const breadcrumbRouteTree: BreadcrumbRouteNode = {
  segment: '',
  children: [
    {
      segment: 'app',
      displayName: 'Backbones',
      children: [
        {
          segment: 'sites',
          isRoutingArtifact: true, // This segment won't appear in breadcrumbs
          children: [
            {
              segment: ':id', // Backbone ID
              displayName: 'Backbone'
            },
            {
              segment: ':bid', // Backbone ID
              children: [
                {
                  segment: ':sid', // Site ID
                  displayName: 'Site'
                }
              ]
            }
          ]
        },
        {
          segment: 'invitations',
          isRoutingArtifact: true,
          children: [
            {
              segment: ':vid',
              displayName: 'Invitation'
            }
          ]
        }
      ]
    },
    {
      segment: 'vans',
      displayName: 'Application Networks'
    }
  ]
};

// Helper function to traverse the route tree
export function findRouteNode(pathSegments: string[]): BreadcrumbRouteNode | null {
  let currentNode = breadcrumbRouteTree;

  for (const segment of pathSegments) {
    if (!currentNode.children) {
      return null;
    }

    const found = currentNode.children.find(
      (child) => child.segment === segment || child.segment.startsWith(':') // Match parameter segments
    );

    if (!found) {
      return null;
    }
    currentNode = found;
  }

  return currentNode;
}

export function getRouteDisplayName(pathSegments: string[], index: number): string {
  const partialPath = pathSegments.slice(0, index + 1);
  const node = findRouteNode(partialPath);

  return node?.displayName || pathSegments[index];
}

export function isRouteArtifact(pathSegments: string[], index: number): boolean {
  const partialPath = pathSegments.slice(0, index + 1);
  const node = findRouteNode(partialPath);

  return node?.isRoutingArtifact || false;
}
