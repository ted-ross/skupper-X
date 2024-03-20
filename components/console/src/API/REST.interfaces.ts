import { AxiosError, AxiosRequestConfig } from 'axios';

import { DeploymentStates } from '@pages/Backbones/Backbones.enum';

import { FlowDirection, SortDirection } from './REST.enum';

export type FetchWithOptions = AxiosRequestConfig;
export type FlowDirections = FlowDirection.Outgoing | FlowDirection.Incoming;

export interface RequestOptions extends Record<string, string | string[] | number | SortDirection | undefined> {
  filter?: string;
  offset?: number;
  limit?: number;
  sortDirection?: SortDirection;
  sortName?: string;
  timeRangeStart?: number;
  timeRangeEnd?: number;
  timeRangeOperation?: number; // 0: intersect , 1: contains, 2: within
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
  results: T; // Type based on the Response interface
  status: string; // this field is for debug scope. Empty value => OK. In case we have some internal BE error that is not a http status this field is not empty. For example a value can be `Malformed sortBy query`
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

export interface SiteRequest {
  name: string;
  claim?: 'true' | 'false';
  peer?: 'true' | 'false';
  member?: 'true' | 'false';
  manage?: 'true' | 'false';
  metadata?: string;
}

export interface SiteResponse {
  id: string;
  name: string;
  failure: string | null;
  firstactivetime: string | null;
  lastheartbeat: string | null;
  lifecycle: string;
  metadata?: string;
  deploymentstate: DeploymentStates;
}

export interface LinkRequest {
  listeningsite: string;
  connectingsite: string;
  cost?: string;
}

export interface LinkResponse {
  id: string;
  listeninginteriorsite: string;
  connectinginteriorsite: string;
  cost: number;
}

export interface VanRequest {
  bid: string;
  name: string;
}
export interface VanResponse {
  id: string;
  name: string;
  backbone: string;
  backbonename: string;
  lifecycle: 'partial' | 'new' | 'ready';
  failure: string | null;
  starttime: string | null;
  endtime: string | null;
  deletedelay: { minutes: number };
}

export interface InvitationRequest {
  name: string;
  claimaccess: string;
  primaryaccess: string;
  secondaryaccess?: string;
  joindeadline?: string;
  siteclass?: string;
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
}

export interface MemberResponse {
  id: string;
  name: string;
  lifecycle: 'partial' | 'new' | 'ready';
  failure: string | null;
  lastheartbeat: string | null;
  siteclass: string | null;
  firstactivetime: string | null;
}
