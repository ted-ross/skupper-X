import { axiosFetch } from './apiMiddleware';
import {
  SiteResponse,
  RequestOptions,
  BackboneResponse,
  BackboneRequest,
  SiteRequest,
  LinkResponse,
  LinkRequest,
  VanResponse,
  VanRequest,
  InvitationResponse,
  InvitationRequest,
  MemberResponse
} from './REST.interfaces';
import {
  getBackbonesPATH,
  getBackbonePATH,
  getInteriorSitesPATH,
  getLinkPATH,
  getVanPATH,
  getInvitationPath,
  getMemberPath,
  getVansPATH
} from './REST.paths';
import { mapOptionsToQueryParams } from './REST.utils';

export const RESTApi = {
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

  deleteBackbone: async (bid: string): Promise<void> => {
    await axiosFetch<void>(`${getBackbonePATH(bid)}`, {
      method: 'DELETE'
    });
  },

  activateBackbone: async (bid: string): Promise<void> => {
    await axiosFetch<void>(`${getBackbonePATH(bid)}/activate`, {
      method: 'PUT'
    });
  },

  fetchSites: async (bid: string, options?: RequestOptions): Promise<SiteResponse[]> => {
    const data = await axiosFetch<SiteResponse[]>(`${getBackbonePATH(bid)}/sites`, {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  createSite: async (bid: string, data: SiteRequest): Promise<string> => {
    const { id } = await axiosFetch<{ id: string }>(`${getBackbonePATH(bid)}/sites`, {
      method: 'POST',
      data
    });

    return id;
  },

  deleteSite: async (id: string): Promise<void> => {
    await axiosFetch<void>(getInteriorSitesPATH(id), {
      method: 'DELETE'
    });
  },

  searchSite: async (id: string): Promise<SiteResponse> => axiosFetch<SiteResponse>(`${getInteriorSitesPATH(id)}`),

  // LINKS APIs
  fetchLinks: async (bid: string, options?: RequestOptions): Promise<LinkResponse[]> => {
    const data = await axiosFetch<LinkResponse[]>(`${getBackbonePATH(bid)}/links`, {
      params: options ? mapOptionsToQueryParams(options) : null
    });

    return data;
  },

  createLink: async (bid: string, data?: LinkRequest): Promise<void> => {
    await axiosFetch<void>(`${getBackbonePATH(bid)}/links`, {
      method: 'POST',
      data
    });
  },

  deleteLink: async (id: string): Promise<void> => {
    await axiosFetch<void>(getLinkPATH(id), {
      method: 'DELETE'
    });
  },

  fetchInitialDeployment: async (id: string): Promise<string> => axiosFetch<string>(`${getInteriorSitesPATH(id)}/kube`),

  fetchIngress: async (sid: string, data: string): Promise<void> => {
    await axiosFetch<void>(`${getInteriorSitesPATH(sid)}/ingress`, {
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST',
      data
    });
  },

  fetchIncomingLinks: async (id: string): Promise<string> =>
    axiosFetch<string>(`${getInteriorSitesPATH(id)}/links/incoming/kube`),

  fetchVans: async (): Promise<VanResponse[]> => axiosFetch<VanResponse[]>(`${getVansPATH()}`),

  createVan: async (bid: string, data?: VanRequest): Promise<void> => {
    await axiosFetch<void>(`${getBackbonePATH(bid)}/vans`, {
      method: 'POST',
      data: {
        name: data?.name
      }
    });
  },

  searchVan: async (vid: string): Promise<VanResponse> => {
    const data = await axiosFetch<VanResponse>(`${getVanPATH(vid)}`, {
      method: 'GET'
    });

    return data;
  },

  deleteVan: async (vid: string): Promise<void> => {
    await axiosFetch<void>(`${getVanPATH(vid)}`, {
      method: 'DELETE'
    });
  },

  fetchInvitations: async (vid: string): Promise<InvitationResponse[]> =>
    axiosFetch<InvitationResponse[]>(`${getVanPATH(vid)}/invitations`),

  createInvitation: async (vid: string, data?: InvitationRequest): Promise<void> => {
    await axiosFetch<void>(`${getVanPATH(vid)}/invitations`, {
      method: 'POST',
      data
    });
  },

  searchInvitation: async (iid: string): Promise<InvitationResponse> => {
    const data = await axiosFetch<InvitationResponse>(`${getInvitationPath(iid)}`, {
      method: 'GET'
    });

    return data;
  },

  searchInvitationYAML: async (id: string): Promise<string> => axiosFetch<string>(`${getInvitationPath(id)}/kube`),

  deleteInvitation: async (vid: string): Promise<void> => {
    await axiosFetch<void>(`${getInvitationPath(vid)}`, {
      method: 'DELETE'
    });
  },

  fetchMembers: async (vid: string): Promise<MemberResponse[]> =>
    axiosFetch<MemberResponse[]>(`${getVanPATH(vid)}/members`),

  searchMember: async (mid: string): Promise<MemberResponse[]> => axiosFetch<MemberResponse[]>(`${getMemberPath(mid)}`),

  fetchAccessClaims: async (bid: string): Promise<{ id: string; name: string }[]> => {
    const data = await axiosFetch<{ id: string; name: string }[]>(`${getBackbonePATH(bid)}/access/claim`, {
      method: 'GET'
    });

    return data;
  },

  fetchAccessMember: async (bid: string): Promise<{ id: string; name: string }[]> => {
    const data = await axiosFetch<{ id: string; name: string }[]>(`${getBackbonePATH(bid)}/access/member`, {
      method: 'GET'
    });

    return data;
  }
};
