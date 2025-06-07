// Lifecycle state enum
export enum ApplicationLifecycle {
  Created = 'created',
  Building = 'building',
  Built = 'built',
  Deploying = 'deploying',
  Deployed = 'deployed',
  Failed = 'failed'
}
