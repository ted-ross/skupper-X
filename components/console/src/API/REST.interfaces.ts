import { AxiosError, AxiosRequestConfig } from 'axios';

import { DeploymentStates } from '../pages/Backbones/Backbones.enum';

// Canonical lifecycle type for member sites (keep in sync with backend)
export type MemberLifeCycleStatus =
  | 'partial'
  | 'new'
  | 'skx_cr_created'
  | 'cm_cert_created'
  | 'cm_issuer_created'
  | 'ready'
  | 'active'
  | 'expired'
  | 'failed';

// Canonical lifecycle type for backbone and van
export type NetworkLifeCycleStatus =
  | 'partial'
  | 'new'
  | 'initializing'
  | 'skx_cr_created'
  | 'creating_resources'
  | 'cm_cert_created'
  | 'generating_certificates'
  | 'cm_issuer_created'
  | 'configuring_issuer'
  | 'deploying'
  | 'starting'
  | 'ready'
  | 'active'
  | 'expired'
  | 'failed'
  | 'error'
  | 'terminating'
  | 'deleting';

// Canonical lifecycle type for invitation
export type InvitationLifeCycleStatus =
  | 'partial'
  | 'new'
  | 'skx_cr_created'
  | 'cm_cert_created'
  | 'cm_issuer_created'
  | 'ready'
  | 'active'
  | 'expired'
  | 'failed';

// Canonical lifecycle type for management controller
export type ManagementControllerLifeCycleStatus = 'partial' | 'new' | 'ready';

// Canonical lifecycle type for applications (keep in sync with backend)
export type ApplicationLifeCycleStatus =
  | 'created'
  | 'build-complete'
  | 'build-warnings'
  | 'build-errors'
  | 'deploy-complete'
  | 'deploy-warnings'
  | 'deploy-errors'
  | 'deployed';

export type FetchWithOptions = AxiosRequestConfig;

export interface RequestOptions extends Record<string, string | string[] | number | 'asc' | 'desc' | undefined> {
  filter?: string;
  offset?: number;
  limit?: number;
  sortDirection?: 'asc' | 'desc';
  sortName?: string;
  timeRangeStart?: number;
  timeRangeEnd?: number;
  timeRangeOperation?: number;
}

export interface QueryParams {
  filter?: string;
  offset?: number;
  limit?: number;
  timeRangeEnd?: number;
  timeRangeStart?: number;
  sortBy?: string | null;
}

export interface HTTPError extends AxiosError {
  message: string;
  httpStatus?: string;
  descriptionMessage?: string;
}

export type ResponseWrapper<T> = {
  results: T;
  status: string;
  count: number;
  timeRangeCount: number;
  totalCount: number;
};

export interface BackboneRequest {
  name: string;
  multitenant?: 'true' | 'false';
}

export interface BackboneResponse {
  id: string;
  name: string;
  multitenant: boolean;
  lifecycle: NetworkLifeCycleStatus;
  failure: string | null;
}

export interface BackboneSiteRequest {
  name: string;
  platform: string;
  metadata?: string;
}

export interface BackboneSiteResponse {
  id: string;
  name: string;
  lifecycle: NetworkLifeCycleStatus;
  failure: string | null;
  metadata?: string;
  deploymentstate: DeploymentStates;
  targetplatform: string;
  platformlong: string;
  firstactivetime: string | null;
  lastheartbeat: string | null;
  tlsexpiration?: string | null;
  tlsrenewal?: string | null;
  backboneid: string;
}

export interface LinkRequest {
  connectingsite: string;
  cost?: number;
}

export interface LinkResponse {
  id: string;
  accesspoint: string;
  connectinginteriorsite: string;
  cost: number;
}

export interface VanRequest {
  name: string;
  starttime?: string;
  endtime?: string;
  deletedelay?: string;
}

export interface VanResponse {
  id: string;
  name: string;
  backboneid: string;
  backbonename: string;
  lifecycle: NetworkLifeCycleStatus;
  failure: string | null;
  starttime: string | null;
  endtime: string | null;
  deletedelay: string | null;
  certificate?: string | null;
  tlsexpiration?: string | null;
  tlsrenewal?: string | null;
}

export interface InvitationRequest {
  name: string;
  claimaccess: string;
  primaryaccess: string;
  secondaryaccess?: string;
  joindeadline?: string;
  siteclass?: string;
  prefix?: string;
  instancelimit?: number;
  interactive?: 'true' | 'false';
}

export interface InvitationResponse {
  id: string;
  name: string;
  lifecycle: InvitationLifeCycleStatus;
  failure: string | null;
  joindeadline: string | null;
  memberclasses: string[] | null;
  instancelimit: number | null;
  instancecount: number;
  fetchcount: number;
  interactive: boolean;
  vanname?: string;
}

export interface MemberSiteResponse {
  id: string;
  name: string;
  lifecycle: MemberLifeCycleStatus;
  failure: string | null;
  lastheartbeat: string | null;
  firstactivetime: string | null;
  memberof: string;
  invitation: string;
  invitationname?: string;
  vanname?: string;
  joindeadline?: string | null; // Added for join-deadline
  interactive?: boolean; // Added for interactive
}

export interface AccessPointRequest {
  name?: string;
  kind: 'claim' | 'peer' | 'member' | 'manage';
  bindhost?: string;
}

export interface AccessPointResponse {
  id: string;
  name: string;
  lifecycle: string;
  failure: string | null;
  hostname: string | null;
  port: number | null;
  kind: 'claim' | 'peer' | 'member' | 'manage';
  bindhost: string | null;
  interiorsite: string;
  sitename?: string;
}

export interface TargetPlatformResponse {
  shortname: string;
  longname: string;
}

export interface IngressRequest {
  [apid: string]: {
    host: string;
    port: number;
  };
}

export interface IngressResponse {
  processed: number;
}

export interface ClaimAccessPointResponse {
  id: string;
  name: string;
}

export interface ApplicationRequest {
  name: string;
  rootblock: string;
}

export interface ApplicationResponse {
  id: string;
  name: string;
  rootblock: string;
  rootname: string;
  lifecycle: ApplicationLifeCycleStatus;
  created: string;
  buildlog?: string;
}

export interface LibraryBlockResponse {
  id: string;
  type: string;
  name: string;
  provider: string;
  bodystyle: 'simple' | 'composite';
  revision: number;
  created: string;
}

export interface LibraryBlockRequest {
  name: string;
  type: string;
  bodystyle: 'simple' | 'composite';
  provider?: string;
}

export interface LibraryBlockUpdateRequest {
  [key: string]: unknown;
}

export interface DeploymentRequest {
  app: string;
  van: string;
}

export interface DeploymentResponse {
  id: string;
}

export interface TlsCertificateResponse {
  id: string;
  isca: boolean;
  objectname: string;
  signedby: string | null;
  expiration: string | null;
  renewaltime: string | null;
  rotationordinal: number;
  supercedes: string | null;
}

export interface CertificateRequestResponse {
  id: string;
  requesttype: 'mgmtController' | 'backboneCA' | 'interiorRouter' | 'accessPoint' | 'vanCA' | 'memberClaim' | 'vanSite';
  issuer: string | null;
  lifecycle: 'new' | 'cm_cert_created' | 'ready';
  failure: string | null;
  hostname: string | null;
  createdtime: string;
  requesttime: string;
  durationhours: number;
  managementcontroller: string | null;
  backbone: string | null;
  interiorsite: string | null;
  accesspoint: string | null;
  applicationnetwork: string | null;
  invitation: string | null;
  site: string | null;
}

export interface ManagementControllerResponse {
  id: string;
  name: string;
  lifecycle: ManagementControllerLifeCycleStatus;
  failure: string | null;
  certificate: string | null;
}

export interface ComposeBlockResponse {
  id: string;
  name: string;
  lifecycle: string;
  failure: string | null;
}

export interface BootstrapResponse {
  yamldata: string;
}

export interface SiteDeploymentConfigResponse {
  yamldata: string;
}

export interface TlsCertificateRequest {
  requesttype: 'mgmtController' | 'backboneCA' | 'interiorRouter' | 'accessPoint' | 'vanCA' | 'memberClaim' | 'vanSite';
  durationhours?: number;
  hostname?: string;
}

export interface HeartbeatRequest {
  lastheartbeat: string;
  firstactivetime?: string;
}

export interface LibraryBlockTypeResponse {
  type: string;
  description?: string;
  allownorth: boolean;
  allowsouth: boolean;
  allocatetosite: boolean;
}

export interface LibraryBlockHistoryResponse {
  revision: number;
  created: string;
  author: string;
  message: string;
  changes: {
    configuration?: boolean;
    interfaces?: boolean;
    body?: boolean;
  };
  data?: {
    configuration?: Record<string, unknown>;
    interfaces?: unknown[];
    body?: unknown;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  httpStatus?: number;
}

// Application Block interface
export interface ApplicationBlock {
  instancename: string;
  libraryblock: string;
  libname: string;
  revision: string;
}

export interface CreateApplicationRequest {
  name: string;
  rootblock: string;
}
