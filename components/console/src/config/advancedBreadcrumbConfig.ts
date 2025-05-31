// Advanced breadcrumb configuration with pattern matching
export interface AdvancedBreadcrumbConfig {
  pattern: RegExp;
  isRoutingArtifact?: boolean;
  displayName?: string | ((match: RegExpMatchArray) => string);
  isNavigable?: boolean;
}

export const advancedBreadcrumbConfigs: AdvancedBreadcrumbConfig[] = [
  // Filter out UUID-looking path segments that are just routing artifacts
  {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    isRoutingArtifact: true
  },
  // Filter out specific known routing artifacts
  {
    pattern: /^(sites|invitations)$/,
    isRoutingArtifact: true
  },
  // Handle parameterized routes with @ notation
  {
    pattern: /^(.+)@(.+)$/,
    displayName: (match) => match[1], // Use the name part before @
    isNavigable: true
  },
  // Default app section
  {
    pattern: /^app$/,
    displayName: 'Backbones'
  },
  // VAN sections
  {
    pattern: /^vans$/,
    displayName: 'Application Networks'
  }
];

export function shouldFilterFromBreadcrumb(pathSegment: string): boolean {
  return advancedBreadcrumbConfigs.some((config) => {
    const match = pathSegment.match(config.pattern);

    return match && config.isRoutingArtifact;
  });
}

export function getAdvancedBreadcrumbDisplayName(pathSegment: string): string {
  for (const config of advancedBreadcrumbConfigs) {
    const match = pathSegment.match(config.pattern);
    if (match) {
      if (typeof config.displayName === 'function') {
        return config.displayName(match);
      } else if (config.displayName) {
        return config.displayName;
      }
      break;
    }
  }

  return pathSegment;
}

export function isBreadcrumbNavigable(pathSegment: string): boolean {
  for (const config of advancedBreadcrumbConfigs) {
    const match = pathSegment.match(config.pattern);
    if (match) {
      return config.isNavigable !== false; // Default to true
    }
  }

  return true;
}
