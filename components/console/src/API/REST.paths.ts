import { BASE_URL_COLLECTOR, COLLECTOR_URL } from '../config/config';

// Note: COLLECTOR_URL already includes /api/v1alpha1

// Backbone paths
const BACKBONES_PATH = `${COLLECTOR_URL}/backbones`;
export const getBackbonesPATH = () => BACKBONES_PATH;
export const getBackbonePATH = (id: string) => `${BACKBONES_PATH}/${id}`;
export const getBackboneActivatePATH = (id: string) => `${BACKBONES_PATH}/${id}/activate`;

// Backbone Sites paths
const BACKBONE_SITES_PATH = `${COLLECTOR_URL}/backbonesites`;
export const getBackboneSitesPATH = (backboneId: string) => `${BACKBONES_PATH}/${backboneId}/sites`;
export const getBackboneSitePATH = (id: string) => `${BACKBONE_SITES_PATH}/${id}`;

// Access Points paths
const ACCESS_POINTS_PATH = `${COLLECTOR_URL}/accesspoints`;
export const getAccessPointPATH = (id: string) => `${ACCESS_POINTS_PATH}/${id}`;
export const getAccessPointsForSitePATH = (siteId: string) => `${BACKBONE_SITES_PATH}/${siteId}/accesspoints`;
export const getAccessPointsForBackbonePATH = (backboneId: string) => `${BACKBONES_PATH}/${backboneId}/accesspoints`;

// Backbone Links paths
const BACKBONE_LINKS_PATH = `${COLLECTOR_URL}/backbonelinks`;
export const getBackboneLinkPATH = (id: string) => `${BACKBONE_LINKS_PATH}/${id}`;
export const getBackboneLinksForBackbonePATH = (backboneId: string) => `${BACKBONES_PATH}/${backboneId}/links`;
export const getBackboneLinksForSitePATH = (siteId: string) => `${BACKBONE_SITES_PATH}/${siteId}/links`;
export const getCreateLinkPATH = (accessPointId: string) => `${ACCESS_POINTS_PATH}/${accessPointId}/links`;

// VAN (Application Networks) paths
const VANS_PATH = `${COLLECTOR_URL}/vans`;
export const getVansPATH = () => VANS_PATH;
export const getVanPATH = (id: string) => `${VANS_PATH}/${id}`;
export const getVansForBackbonePATH = (backboneId: string) => `${BACKBONES_PATH}/${backboneId}/vans`;
export const getCreateVanPATH = (backboneId: string) => `${BACKBONES_PATH}/${backboneId}/vans`;
export const getEvictVanPATH = (id: string) => `${VANS_PATH}/${id}/evict`;

// Invitation paths
const INVITATIONS_PATH = `${COLLECTOR_URL}/invitations`;
export const getInvitationsPATH = () => INVITATIONS_PATH;
export const getInvitationPATH = (id: string) => `${INVITATIONS_PATH}/${id}`;
export const getInvitationYamlPATH = (id: string) => `${INVITATIONS_PATH}/${id}/kube`;
export const getInvitationsForVanPATH = (vanId: string) => `${VANS_PATH}/${vanId}/invitations`;
export const getCreateInvitationPATH = (vanId: string) => `${VANS_PATH}/${vanId}/invitations`;
export const getExpireInvitationPATH = (id: string) => `${INVITATIONS_PATH}/${id}/expire`;

// Member paths
const MEMBERS_PATH = `${COLLECTOR_URL}/members`;
export const getMemberPATH = (id: string) => `${MEMBERS_PATH}/${id}`;
export const getMembersForVanPATH = (vanId: string) => `${VANS_PATH}/${vanId}/members`;
export const getEvictMemberPATH = (id: string) => `${MEMBERS_PATH}/${id}/evict`;

// TLS Certificate paths
const TLS_CERTIFICATES_PATH = `${COLLECTOR_URL}/tls-certificates`;
export const getTlsCertificatePATH = (id: string) => `${TLS_CERTIFICATES_PATH}/${id}`;

// Target Platform paths
const TARGET_PLATFORMS_PATH = `${COLLECTOR_URL}/targetplatforms`;
export const getTargetPlatformsPATH = () => TARGET_PLATFORMS_PATH;

// Site Deployment paths
export const getSiteDeploymentPATH = (siteId: string, target: 'sk2' | 'kube') =>
  `${COLLECTOR_URL}/backbonesite/${siteId}/${target}`;

// Access Point Deployment paths
export const getAccessPointDeploymentPATH = (siteId: string, target: 'sk2' | 'kube') =>
  `${COLLECTOR_URL}/backbonesite/${siteId}/accesspoints/${target}`;

// Ingress paths
export const getIngressPATH = (siteId: string) => `${COLLECTOR_URL}/backbonesite/${siteId}/ingress`;

// Library Block paths
const LIBRARIES_PATH = `${BASE_URL_COLLECTOR}/compose/v1alpha1/library/blocks`;
export const getLibrariesPATH = () => LIBRARIES_PATH;
export const getLibraryPATH = (id: string) => `${LIBRARIES_PATH}/${id}`;
export const getLibraryConfigPATH = (id: string) => `${LIBRARIES_PATH}/${id}/config`;
export const getLibraryInterfacesPATH = (id: string) => `${LIBRARIES_PATH}/${id}/interfaces`;
export const getLibraryBodyPATH = (id: string) => `${LIBRARIES_PATH}/${id}/body`;
export const getLibraryHistoryPATH = (id: string) => `${LIBRARIES_PATH}/${id}/history`;
export const getLibraryBlockTypesPATH = () => `${BASE_URL_COLLECTOR}/compose/v1alpha1/library/blocktypes`;
export const getLibraryBodyStylesPATH = () => `${BASE_URL_COLLECTOR}/compose/v1alpha1/library/bodystyles`;
export const getInterfaceRolesPATH = () => `${BASE_URL_COLLECTOR}/compose/v1alpha1/interfaceroles`;

// Application paths
const APPLICATIONS_PATH = `${BASE_URL_COLLECTOR}/compose/v1alpha1/applications`;
export const getApplicationsPATH = () => APPLICATIONS_PATH;
export const getApplicationPATH = (id: string) => `${APPLICATIONS_PATH}/${id}`;
export const getApplicationBuildPATH = (id: string) => `${APPLICATIONS_PATH}/${id}/build`;
export const getApplicationLogPATH = (id: string) => `${APPLICATIONS_PATH}/${id}/log`;
export const getApplicationBlocksPATH = (id: string) => `${APPLICATIONS_PATH}/${id}/blocks`;

// Deployment paths
const DEPLOYMENTS_PATH = `${BASE_URL_COLLECTOR}/compose/v1alpha1/deployments`;
export const getDeploymentsPATH = () => DEPLOYMENTS_PATH;
export const getDeploymentPATH = (id: string) => `${DEPLOYMENTS_PATH}/${id}`;
export const getDeploymentDeployPATH = (id: string) => `${DEPLOYMENTS_PATH}/${id}/deploy`;
export const getDeploymentLogPATH = (id: string) => `${DEPLOYMENTS_PATH}/${id}/log`;
