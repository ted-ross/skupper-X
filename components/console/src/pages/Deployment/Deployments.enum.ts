export enum RoutesPaths {
  Deployment = '/deployment'
}

export enum QueriesDeployment {
  GetDeployments = 'getDeployments',
  GetDeployment = 'getDeployment',
  CreateDeployment = 'createDeployment',
  DeleteDeployment = 'deleteDeployment'
}

export enum DeploymentLifecycle {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending',
  Failed = 'failed'
}
