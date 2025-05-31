import { axiosFetch } from './apiMiddleware';
import {
  BackboneSiteResponse,
  RequestOptions,
  BackboneResponse,
  BackboneRequest,
  BackboneSiteRequest,
  LinkResponse,
  LinkRequest,
  ApplicationNetworkResponse,
  ApplicationNetworkRequest,
  InvitationResponse,
  InvitationRequest,
  MemberSiteResponse,
  AccessPointResponse,
  AccessPointRequest,
  TlsCertificateResponse,
  TargetPlatformResponse
} from './REST.interfaces';
import {
  getBackbonesPATH,
  getBackbonePATH,
  getBackboneActivatePATH,
  getBackboneSitePATH,
  getBackboneSitesPATH,
  getBackboneLinkPATH,
  getBackboneLinksForBackbonePATH,
  getBackboneLinksForSitePATH,
  getCreateLinkPATH,
  getVanPATH,
  getVansPATH,
  getVansForBackbonePATH,
  getCreateVanPATH,
  getEvictVanPATH,
  getInvitationPATH,
  getInvitationsPATH,
  getInvitationYamlPATH,
  getInvitationsForVanPATH,
  getCreateInvitationPATH,
  getExpireInvitationPATH,
  getMemberPATH,
  getMembersForVanPATH,
  getEvictMemberPATH,
  getAccessPointPATH,
  getAccessPointsForSitePATH,
  getAccessPointsForBackbonePATH,
  getClaimAccessPATH,
  getMemberAccessPATH,
  getTlsCertificatePATH,
  getTargetPlatformsPATH,
  getSiteDeploymentPATH,
  getIngressPATH
} from './REST.paths';
import { mapOptionsToQueryParams } from './REST.utils';

export const RESTApi = {
  // BACKBONE APIs
  fetchBackbones: async (options?: RequestOptions): Promise<BackboneResponse[]> => {
    const data = await axiosFetch<BackboneResponse[]>(getBackbonesPATH(), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  createBackbone: async (data: BackboneRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getBackbonesPATH(), {
      method: 'POST',
      data
    });

    return id;
  },

  searchBackbone: async (bid: string): Promise<BackboneResponse> => {
    const data = await axiosFetch<BackboneResponse>(getBackbonePATH(bid));

    return data;
  },

  deleteBackbone: async (bid: string): Promise<void> => {
    await axiosFetch<void>(getBackbonePATH(bid), {
      method: 'DELETE'
    });
  },

  activateBackbone: async (bid: string): Promise<void> => {
    await axiosFetch<void>(getBackboneActivatePATH(bid), {
      method: 'PUT'
    });
  },

  // BACKBONE SITE APIs
  fetchSites: async (bid: string, options?: RequestOptions): Promise<BackboneSiteResponse[]> => {
    const data = await axiosFetch<BackboneSiteResponse[]>(getBackboneSitesPATH(bid), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  createSite: async (bid: string, data: BackboneSiteRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getBackboneSitesPATH(bid), {
      method: 'POST',
      data
    });

    return id;
  },

  searchSite: async (sid: string): Promise<BackboneSiteResponse> => {
    const data = await axiosFetch<BackboneSiteResponse>(getBackboneSitePATH(sid));

    return data;
  },

  updateSite: async (sid: string, data: Partial<BackboneSiteRequest>): Promise<void> => {
    await axiosFetch<void>(getBackboneSitePATH(sid), {
      method: 'PUT',
      data
    });
  },

  deleteSite: async (sid: string): Promise<void> => {
    await axiosFetch<void>(getBackboneSitePATH(sid), {
      method: 'DELETE'
    });
  },

  // ACCESS POINT APIs
  fetchAccessPointsForSite: async (sid: string, options?: RequestOptions): Promise<AccessPointResponse[]> => {
    const data = await axiosFetch<AccessPointResponse[]>(getAccessPointsForSitePATH(sid), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  fetchAccessPointsForBackbone: async (bid: string, options?: RequestOptions): Promise<AccessPointResponse[]> => {
    const data = await axiosFetch<AccessPointResponse[]>(getAccessPointsForBackbonePATH(bid), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  createAccessPoint: async (sid: string, data: AccessPointRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getAccessPointsForSitePATH(sid), {
      method: 'POST',
      data
    });

    return id;
  },

  searchAccessPoint: async (apid: string): Promise<AccessPointResponse> => {
    const data = await axiosFetch<AccessPointResponse>(getAccessPointPATH(apid));

    return data;
  },

  deleteAccessPoint: async (apid: string): Promise<void> => {
    await axiosFetch<void>(getAccessPointPATH(apid), {
      method: 'DELETE'
    });
  },

  // BACKBONE LINK APIs
  fetchLinksForBackbone: async (bid: string, options?: RequestOptions): Promise<LinkResponse[]> => {
    const data = await axiosFetch<LinkResponse[]>(getBackboneLinksForBackbonePATH(bid), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  fetchLinksForSite: async (sid: string, options?: RequestOptions): Promise<LinkResponse[]> => {
    const data = await axiosFetch<LinkResponse[]>(getBackboneLinksForSitePATH(sid), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  createLink: async (apid: string, data: LinkRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getCreateLinkPATH(apid), {
      method: 'POST',
      data
    });

    return id;
  },

  updateLink: async (lid: string, data: Partial<LinkRequest>): Promise<void> => {
    await axiosFetch<void>(getBackboneLinkPATH(lid), {
      method: 'PUT',
      data
    });
  },

  deleteLink: async (lid: string): Promise<void> => {
    await axiosFetch<void>(getBackboneLinkPATH(lid), {
      method: 'DELETE'
    });
  },

  // VAN (APPLICATION NETWORK) APIs
  fetchVans: async (): Promise<ApplicationNetworkResponse[]> => {
    const data = await axiosFetch<ApplicationNetworkResponse[]>(getVansPATH());

    return data;
  },

  fetchVansForBackbone: async (bid: string): Promise<ApplicationNetworkResponse[]> => {
    const data = await axiosFetch<ApplicationNetworkResponse[]>(getVansForBackbonePATH(bid));

    return data;
  },

  createVan: async (bid: string, data: ApplicationNetworkRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getCreateVanPATH(bid), {
      method: 'POST',
      data
    });

    return id;
  },

  searchVan: async (vid: string): Promise<ApplicationNetworkResponse> => {
    const data = await axiosFetch<ApplicationNetworkResponse>(getVanPATH(vid));

    return data;
  },

  deleteVan: async (vid: string): Promise<void> => {
    await axiosFetch<void>(getVanPATH(vid), {
      method: 'DELETE'
    });
  },

  evictVan: async (vid: string): Promise<void> => {
    await axiosFetch<void>(getEvictVanPATH(vid), {
      method: 'PUT'
    });
  },

  // INVITATION APIs
  fetchInvitations: async (vid: string): Promise<InvitationResponse[]> => {
    const data = await axiosFetch<InvitationResponse[]>(getInvitationsForVanPATH(vid));

    return data;
  },

  fetchAllInvitations: async (): Promise<InvitationResponse[]> => {
    const data = await axiosFetch<InvitationResponse[]>(getInvitationsPATH());

    return data;
  },

  createInvitation: async (vid: string, data: InvitationRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getCreateInvitationPATH(vid), {
      method: 'POST',
      data
    });

    return id;
  },

  searchInvitation: async (iid: string): Promise<InvitationResponse> => {
    const data = await axiosFetch<InvitationResponse>(getInvitationPATH(iid));

    return data;
  },

  searchInvitationYAML: async (iid: string): Promise<string> => {
    const data = await axiosFetch<string>(getInvitationYamlPATH(iid));

    return data;
  },

  deleteInvitation: async (iid: string): Promise<void> => {
    await axiosFetch<void>(getInvitationPATH(iid), {
      method: 'DELETE'
    });
  },

  expireInvitation: async (iid: string): Promise<void> => {
    await axiosFetch<void>(getExpireInvitationPATH(iid), {
      method: 'PUT'
    });
  },

  // MEMBER APIs
  fetchMembers: async (vid: string): Promise<MemberSiteResponse[]> => {
    const data = await axiosFetch<MemberSiteResponse[]>(getMembersForVanPATH(vid));

    return data;
  },

  searchMember: async (mid: string): Promise<MemberSiteResponse> => {
    const data = await axiosFetch<MemberSiteResponse>(getMemberPATH(mid));

    return data;
  },

  evictMember: async (mid: string): Promise<void> => {
    await axiosFetch<void>(getEvictMemberPATH(mid), {
      method: 'PUT'
    });
  },

  // ACCESS CLAIM/MEMBER APIs
  fetchAccessClaims: async (bid: string): Promise<{ id: string; name: string }[]> => {
    const data = await axiosFetch<{ id: string; name: string }[]>(getClaimAccessPATH(bid));

    return data;
  },

  fetchAccessMember: async (bid: string): Promise<{ id: string; name: string }[]> => {
    const data = await axiosFetch<{ id: string; name: string }[]>(getMemberAccessPATH(bid));

    return data;
  },

  // TLS CERTIFICATE APIs
  fetchTlsCertificate: async (cid: string): Promise<TlsCertificateResponse> => {
    const data = await axiosFetch<TlsCertificateResponse>(getTlsCertificatePATH(cid));

    return data;
  },

  // TARGET PLATFORM APIs
  fetchTargetPlatforms: async (): Promise<TargetPlatformResponse[]> => {
    const data = await axiosFetch<TargetPlatformResponse[]>(getTargetPlatformsPATH());

    return data;
  },

  // DEPLOYMENT APIs
  fetchSiteDeployment: async (sid: string, target: 'sk2' | 'kube'): Promise<string> => {
    const data = await axiosFetch<string>(getSiteDeploymentPATH(sid, target));

    return data;
  },

  // INGRESS APIs
  createIngress: async (sid: string, data: any): Promise<void> => {
    await axiosFetch<void>(getIngressPATH(sid), {
      method: 'POST',
      data
    });
  }
};
