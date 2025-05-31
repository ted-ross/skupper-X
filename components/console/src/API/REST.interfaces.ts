import { AxiosError, AxiosRequestConfig } from 'axios';

import { DeploymentStates } from '../pages/Backbones/Backbones.enum';

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
  lifecycle: 'partial' | 'new' | 'ready';
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
  lifecycle: string;
  failure: string | null;
  metadata?: string;
  deploymentstate: DeploymentStates;
  targetplatform: string;
  platformlong: string;
  firstactivetime: string | null;
  lastheartbeat: string | null;
  tlsexpiration?: string | null;
  tlsrenewal?: string | null;
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

export interface ApplicationNetworkRequest {
  name: string;
  starttime?: string;
  endtime?: string;
  deletedelay?: string;
}

export interface ApplicationNetworkResponse {
  id: string;
  name: string;
  backbone?: string;
  backbonename?: string;
  lifecycle: 'partial' | 'new' | 'ready';
  failure: string | null;
  starttime: string | null;
  endtime: string | null;
  deletedelay: string | null;
}

export interface InvitationRequest {
  name: string;
  claimaccess: string;
  memberaccess: string;
  secondaryaccess?: string;
  joindeadline?: string;
  memberclass?: string;
  instancelimit?: number;
  interactive?: boolean;
}

export interface InvitationResponse {
  id: string;
  name: string;
  lifecycle: 'partial' | 'new' | 'ready';
  failure: string | null;
  joindeadline: string | null;
  memberclass: string | null;
  instancelimit: number | null;
  instancecount: number;
  interactive: boolean;
  vanname?: string;
}

export interface MemberSiteResponse {
  id: string;
  name: string;
  lifecycle: 'partial' | 'new' | 'ready';
  failure: string | null;
  lastheartbeat: string | null;
  firstactivetime: string | null;
  memberof: string;
  invitation: string;
  invitationname?: string;
  vanname?: string;
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
  lifecycle: string;
  buildlog?: string;
}

export interface LibraryBlockResponse {
  id: string;
  name: string;
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
  lifecycle: 'partial' | 'new' | 'ready';
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

export interface ErrorResponse {
  error: string;
  message: string;
  httpStatus?: number;
}
