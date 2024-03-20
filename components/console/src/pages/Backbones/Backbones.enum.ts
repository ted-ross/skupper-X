export enum RoutesPaths {
  App = '/app'
}

export enum QueriesBackbones {
  GetBackbones = 'get-backbones-query',
  GetSites = 'get-sites-query',
  GetSite = 'get-site-query',
  GetLinks = 'get-links-query',
  GetKubeInfo = 'get-kubeInfo-query',
  GetIncomingLinks = 'get-incoming-links-query',
  GetVans = 'get-vans-query',
  GetVan = 'get-van-query',
  GetInvitations = 'get-invitations-query',
  GetInvitationsYAML = 'get-invitations-yaml-query',
  GetMembers = 'get-members-query',
  GetAccessClaim = 'get-access-claim-query',
  GetAccessMember = 'get-access-member-query'
}

export enum BackboneLabels {
  Section = 'Backbones',
  Backbones = 'Backbones',
  ApplicationNetworks = 'Application Networks',
  Description = 'A backbone is the central core of a network, that connects sites',
  Name = 'Name',
  Lifecycle = 'Lifecycle',
  Multitenant = 'Multitenant',
  CreateBackboneTitle = 'Create backbone',
  DeleteBackboneBtn = 'Delete',
  ActivateBackboneBtn = 'Activate',
  SubmitBackboneBtn = 'Submit',
  CancelBackboneBtn = 'Cancel',
  DoneBtn = 'Done',
  ErrorMessageRequiredField = 'Fill out all required fields before continuing',
  FormNameDescription = "The backbone's name",
  TableViewTitle = 'Table view',
  TopologyViewTitle = 'Topology view',
  Sites = 'Sites',
  Links = 'Links',
  Vans = 'Vans',
  Invitations = 'Invitations',
  Members = 'Members'
}

export enum SiteLabels {
  Claim = 'Claim',
  Peer = 'Peer',
  Member = 'Member',
  Manage = 'Manage',
  CreateSiteTitle = 'Create site',
  FirstActiveTime = 'First Active Time',
  LastHeartBeat = 'Last Heartbeat',
  DeploymentState = 'Deployment State'
}

export enum LinkLabels {
  CreateLinkTitle = 'Create link',
  ListeningSite = 'To',
  ConnectingSite = 'From',
  Cost = 'Cost'
}

export enum TopologyLabels {
  SaveTopology = 'Save Topology',
  Details = 'Details'
}

export enum DeploymentStates {
  NotReady = 'not-ready',
  ReadyBootstrap = 'ready-bootstrap',
  ReadyAutomatic = 'ready-automatic',
  Deployed = 'deployed'
}

export enum ContextMenuLabels {
  ViewDetails = 'View details',
  AddLink = 'Add link',
  DeleteLink = 'Delete link',
  DeleteSite = 'Delete site',
  GetReadyAutomaticConfig = 'Get automatic config',
  GetReadyBootstrapConfig = 'Get bootstrap config'
}

export enum VanLabels {
  Name = 'Name',
  Lifecycle = 'Lifecycle',
  EndTime = 'End Time',
  BackBone = 'Backbone',
  DeleteDelay = 'Delay',
  CreateVanTitle = 'Create VAN'
}

export enum InvitationLabels {
  Section = 'Access',
  Name = 'Name',
  Lifecycle = 'Lifecycle',
  Limit = 'Max',
  Count = 'Count',
  MemberClass = 'Member Class',
  DeadLine = 'Deadline',
  Interactive = 'Interactive',
  CreateTitle = 'Create Invitation',
  ClaimAccess = 'Claim Access',
  MemberAccess = 'Member Access',
  GetInvitationYAMLTitle = 'YAML'
}

export enum MemberLabels {
  Name = 'Name',
  Lifecycle = 'Lifecycle',
  LastHeartbeat = 'Last Heartbeat',
  SiteClass = 'Site Class',
  FirstActiveTime = 'First Active Time'
}
