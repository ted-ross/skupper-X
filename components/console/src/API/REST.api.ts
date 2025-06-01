import { axiosFetch } from './apiMiddleware';
import {
  BackboneSiteResponse,
  RequestOptions,
  BackboneResponse,
  BackboneRequest,
  BackboneSiteRequest,
  LinkResponse,
  LinkRequest,
  VanResponse,
  VanRequest,
  InvitationResponse,
  InvitationRequest,
  MemberSiteResponse,
  AccessPointResponse,
  AccessPointRequest,
  TlsCertificateResponse,
  TargetPlatformResponse,
  LibraryBlockResponse,
  LibraryBlockRequest,
  LibraryBlockUpdateRequest,
  LibraryBlockTypeResponse,
  LibraryBlockHistoryResponse,
  IngressRequest,
  ApplicationResponse,
  ApplicationBlock,
  CreateApplicationRequest
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
  getIngressPATH,
  getLibrariesPATH,
  getLibraryPATH,
  getLibraryConfigPATH,
  getLibraryInterfacesPATH,
  getLibraryBodyPATH,
  getLibraryHistoryPATH,
  getLibraryBlockTypesPATH,
  getLibraryBodyStylesPATH,
  getInterfaceRolesPATH,
  getApplicationsPATH,
  getApplicationPATH,
  getApplicationBuildPATH,
  getApplicationLogPATH,
  getApplicationBlocksPATH
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
  fetchVans: async (): Promise<VanResponse[]> => {
    const data = await axiosFetch<VanResponse[]>(getVansPATH());

    return data;
  },

  fetchVansForBackbone: async (bid: string): Promise<VanResponse[]> => {
    const data = await axiosFetch<VanResponse[]>(getVansForBackbonePATH(bid));

    return data;
  },

  createVan: async (bid: string, data: VanRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(getCreateVanPATH(bid), {
      method: 'POST',
      data
    });

    return id;
  },

  searchVan: async (vid: string): Promise<VanResponse> => {
    const data = await axiosFetch<VanResponse>(getVanPATH(vid));

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
  createIngress: async (sid: string, data: IngressRequest): Promise<void> => {
    await axiosFetch<void>(getIngressPATH(sid), {
      method: 'POST',
      data
    });
  },

  // LIBRARY BLOCK APIs
  fetchLibraries: async (options?: RequestOptions): Promise<LibraryBlockResponse[]> => {
    const data = await axiosFetch<LibraryBlockResponse[]>(getLibrariesPATH(), {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  fetchLibraryBlock: async (id: string): Promise<LibraryBlockResponse> => {
    const data = await axiosFetch<LibraryBlockResponse>(getLibraryPATH(id));

    return data;
  },

  fetchLibraryConfig: async (id: string): Promise<LibraryBlockUpdateRequest> => {
    const data = await axiosFetch<LibraryBlockUpdateRequest>(getLibraryConfigPATH(id));

    return data;
  },

  fetchLibraryInterfaces: async (id: string): Promise<LibraryBlockUpdateRequest> => {
    const data = await axiosFetch<LibraryBlockUpdateRequest>(getLibraryInterfacesPATH(id));

    return data;
  },

  fetchLibraryBody: async (id: string): Promise<LibraryBlockUpdateRequest> => {
    const data = await axiosFetch<LibraryBlockUpdateRequest>(getLibraryBodyPATH(id));

    return data;
  },

  deleteLibrary: async (id: string): Promise<void> => {
    await axiosFetch<void>(getLibraryPATH(id), {
      method: 'DELETE'
    });
  },

  createLibrary: async (data: LibraryBlockRequest): Promise<{ id: string }> => {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('type', data.type);
    formData.append('bodystyle', data.bodystyle);
    if (data.provider) {
      formData.append('provider', data.provider);
    }

    const response = await axiosFetch<{ id: string }>(getLibrariesPATH(), {
      method: 'POST',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response;
  },

  createLibraryJson: async (data: LibraryBlockRequest): Promise<{ id: string }> => {
    const response = await axiosFetch<{ id: string }>(getLibrariesPATH(), {
      method: 'POST',
      data,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response;
  },

  fetchLibraryBlockTypes: async (): Promise<LibraryBlockTypeResponse[]> => {
    const data = await axiosFetch<LibraryBlockTypeResponse[]>(getLibraryBlockTypesPATH());

    return data;
  },

  fetchLibraryBodyStyles: async (): Promise<string[]> => {
    const data = await axiosFetch<string[]>(getLibraryBodyStylesPATH());

    return data;
  },

  fetchInterfaceRoles: async (): Promise<{ name: string; description?: string }[]> => {
    const data = await axiosFetch<{ name: string; description?: string }[]>(getInterfaceRolesPATH());

    return data;
  },

  updateLibraryConfig: async (id: string, config: LibraryBlockUpdateRequest): Promise<void> => {
    await axiosFetch<void>(getLibraryConfigPATH(id), {
      method: 'PUT',
      data: config
    });
  },

  updateLibraryInterfaces: async (id: string, interfaces: LibraryBlockUpdateRequest): Promise<void> => {
    await axiosFetch<void>(getLibraryInterfacesPATH(id), {
      method: 'PUT',
      data: interfaces
    });
  },

  updateLibraryBody: async (id: string, body: LibraryBlockUpdateRequest): Promise<void> => {
    await axiosFetch<void>(getLibraryBodyPATH(id), {
      method: 'PUT',
      data: body
    });
  },

  fetchLibraryHistory: async (id: string): Promise<LibraryBlockHistoryResponse[]> => {
    const data = await axiosFetch<LibraryBlockHistoryResponse[]>(getLibraryHistoryPATH(id));

    return data;
  },

  // APPLICATION APIs
  fetchApplications: async (options?: RequestOptions): Promise<ApplicationResponse[]> => {
    console.log('API fetchApplications called with options:', options);
    const data = await axiosFetch<ApplicationResponse[]>(getApplicationsPATH(), {
      params: options ? mapOptionsToQueryParams(options) : null
    });
    console.log('API fetchApplications result:', data);
    return data;
  },

  fetchApplicationDetail: async (id: string): Promise<ApplicationResponse> => {
    const data = await axiosFetch<ApplicationResponse>(getApplicationPATH(id));

    return data;
  },

  createApplication: async (data: CreateApplicationRequest): Promise<string> => {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('rootblock', data.rootblock);

    const response = await axiosFetch<{ id: string }>(getApplicationsPATH(), {
      method: 'POST',
      data: formData
    });

    return response.id;
  },

  deleteApplication: async (id: string): Promise<void> => {
    await axiosFetch<void>(getApplicationPATH(id), {
      method: 'DELETE'
    });
  },

  buildApplication: async (id: string): Promise<void> => {
    await axiosFetch<void>(getApplicationBuildPATH(id), {
      method: 'PUT'
    });
  },

  fetchApplicationLog: async (id: string): Promise<string> => {
    const data = await axiosFetch<string>(getApplicationLogPATH(id));

    return data;
  },

  fetchApplicationBlocks: async (id: string): Promise<ApplicationBlock[]> => {
    const data = await axiosFetch<ApplicationBlock[]>(getApplicationBlocksPATH(id));

    return data;
  }
};
