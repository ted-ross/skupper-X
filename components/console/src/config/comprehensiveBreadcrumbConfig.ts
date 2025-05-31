// Comprehensive breadcrumb filtering solution
// This combines pattern matching, route configuration, and context awareness

export interface BreadcrumbSegmentMatcher {
  test: (segment: string, context: BreadcrumbContext) => boolean;
  isRoutingArtifact?: boolean;
  getDisplayName?: (segment: string, context: BreadcrumbContext) => string;
}

export interface BreadcrumbContext {
  fullPath: string;
  pathSegments: string[];
  currentIndex: number;
  previousSegments: string[];
  nextSegments: string[];
}

export const breadcrumbMatchers: BreadcrumbSegmentMatcher[] = [
  // Filter out known routing artifacts in specific contexts
  {
    test: (segment, context) =>
      // "sites" is a routing artifact when it appears after "app"
      segment === 'sites' && context.previousSegments.includes('app'),
    isRoutingArtifact: true
  },
  {
    test: (segment, context) =>
      // "invitations" is a routing artifact when it appears after "app"
      segment === 'invitations' && context.previousSegments.includes('app'),
    isRoutingArtifact: true
  },
  // Handle UUID-like segments (could be IDs that don't provide meaningful navigation)
  {
    test: (segment) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment),
    isRoutingArtifact: false, // Keep IDs but could be made configurable
    getDisplayName: (segment) =>
      // For demo - in real implementation, you might fetch actual names
      `${segment.substring(0, 8)}...`
  },
  // Handle parameterized segments with @ notation
  {
    test: (segment) => segment.includes('@'),
    getDisplayName: (segment) => segment.split('@')[0]
  },
  // App section mapping
  {
    test: (segment) => segment === 'app',
    getDisplayName: () => 'Backbones'
  },
  // VAN section mapping
  {
    test: (segment) => segment === 'vans',
    getDisplayName: () => 'Application Networks'
  }
];

export function isRoutingArtifactAdvanced(segment: string, pathSegments: string[], currentIndex: number): boolean {
  const context: BreadcrumbContext = {
    fullPath: `/${pathSegments.join('/')}`,
    pathSegments,
    currentIndex,
    previousSegments: pathSegments.slice(0, currentIndex),
    nextSegments: pathSegments.slice(currentIndex + 1)
  };

  for (const matcher of breadcrumbMatchers) {
    if (matcher.test(segment, context)) {
      return matcher.isRoutingArtifact || false;
    }
  }

  return false;
}

export function getBreadcrumbDisplayNameAdvanced(
  segment: string,
  pathSegments: string[],
  currentIndex: number
): string {
  const context: BreadcrumbContext = {
    fullPath: `/${pathSegments.join('/')}`,
    pathSegments,
    currentIndex,
    previousSegments: pathSegments.slice(0, currentIndex),
    nextSegments: pathSegments.slice(currentIndex + 1)
  };

  for (const matcher of breadcrumbMatchers) {
    if (matcher.test(segment, context) && matcher.getDisplayName) {
      return matcher.getDisplayName(segment, context);
    }
  }

  return segment;
}
