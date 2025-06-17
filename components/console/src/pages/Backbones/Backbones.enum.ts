export enum RoutesPaths {
  Backbones = '/backbones'
}

export enum QueriesBackbones {
  GetBackbones = 'get-backbones-query',
  GetSites = 'get-sites-query',
  GetSite = 'get-site-query',
  GetLinks = 'get-links-query',
  GetKubeInfo = 'get-kubeInfo-query',
  GetIncomingLinks = 'get-incoming-links-query'
}

export enum DeploymentStates {
  NotReady = 'not-ready',
  ReadyBootstrap = 'ready-bootstrap',
  ReadyAutomatic = 'ready-automatic',
  Deployed = 'deployed'
}
