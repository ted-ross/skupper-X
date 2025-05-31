// Configuration for breadcrumb behavior
export interface BreadcrumbRouteConfig {
  path: string;
  isRoutingArtifact?: boolean; // If true, this segment won't appear in breadcrumbs
  displayName?: string; // Custom display name for the breadcrumb
  isNavigable?: boolean; // If false, won't be clickable
}

export const breadcrumbRouteConfigs: BreadcrumbRouteConfig[] = [
  {
    path: '/app',
    displayName: 'Backbones'
  },
  {
    path: '/app/sites',
    isRoutingArtifact: true // This will be filtered out
  },
  {
    path: '/app/invitations',
    isRoutingArtifact: true // This will be filtered out
  },
  {
    path: '/vans',
    displayName: 'Application Networks'
  }
  // Add more route configurations as needed
];

// Helper function to check if a path segment should be filtered
export function isRoutingArtifact(pathSegment: string): boolean {
  return breadcrumbRouteConfigs.some((config) => config.path.endsWith(`/${pathSegment}`) && config.isRoutingArtifact);
}

// Helper function to get display name for a path segment
export function getBreadcrumbDisplayName(pathSegment: string): string {
  const config = breadcrumbRouteConfigs.find((routeConfig) => routeConfig.path.endsWith(`/${pathSegment}`));

  return config?.displayName || pathSegment;
}
