import { COLLECTOR_URL } from '@config/config';

const BACKBONES_PATH = `${COLLECTOR_URL}/backbones/`;
export const getBackbonesPATH = () => BACKBONES_PATH;

const BACKBONE_PATH = `${COLLECTOR_URL}/backbone/`;
export const getBackbonePATH = (id: string) => `${BACKBONE_PATH}${id}`;

const INTERIOR_SITES_PATH = `${COLLECTOR_URL}/backbonesite/`;
export const getInteriorSitesPATH = (id: string) => `${INTERIOR_SITES_PATH}${id}`;

const LINK_PATH = `${COLLECTOR_URL}/backbonelink/`;
export const getLinkPATH = (id: string) => `${LINK_PATH}${id}`;

const HOSTNAMES_PATH = `${COLLECTOR_URL}/hostnames`;
export const getHostnamesPATH = () => HOSTNAMES_PATH;

const VANS_PATH = `${COLLECTOR_URL}/vans`;
const VAN_PATH = `${COLLECTOR_URL}/van/`;
export const getVansPATH = () => VANS_PATH;
export const getVanPATH = (id: string) => `${VAN_PATH}${id}`;

const INVITATION_PATH = `${COLLECTOR_URL}/invitation/`;
export const getInvitationPath = (id: string) => `${INVITATION_PATH}${id}`;

const MEMBER_PATH = `${COLLECTOR_URL}/member/`;
export const getMemberPath = (id: string) => `${MEMBER_PATH}${id}`;
