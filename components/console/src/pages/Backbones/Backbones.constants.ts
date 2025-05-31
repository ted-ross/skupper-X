import {
  BackboneLabels,
  RoutesPaths,
  DeploymentStates,
  InvitationLabels,
  LinkLabels,
  MemberLabels,
  SiteLabels,
  VanLabels
} from './Backbones.enum';
import {
  BackboneResponse,
  InvitationResponse,
  LinkResponse,
  MemberSiteResponse,
  BackboneSiteResponse,
  ApplicationNetworkResponse
} from '../../API/REST.interfaces';
import { hexColors } from '../../config/colors';
import { SKColumn } from '../../core/components/SkTable/SkTable.interfaces';

export const BackbonesPaths = {
  path: RoutesPaths.App,
  name: BackboneLabels.Section
};

export const backboneColumns: SKColumn<BackboneResponse>[] = [
  {
    name: BackboneLabels.Name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: BackboneLabels.Lifecycle,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: BackboneLabels.Multitenant,
    prop: 'multitenant',
    customCellName: 'booleanCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const siteColumns: SKColumn<BackboneSiteResponse>[] = [
  {
    name: BackboneLabels.Name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: BackboneLabels.Lifecycle,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: SiteLabels.DeploymentState,
    prop: 'deploymentstate',
    customCellName: 'deploymentStateCell'
  },
  {
    name: SiteLabels.LastHeartBeat,
    prop: 'lastheartbeat',
    customCellName: 'DateCell'
  },
  {
    name: SiteLabels.FirstActiveTime,
    prop: 'firstactivetime',
    customCellName: 'DateCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const linkColumns: SKColumn<LinkResponse>[] = [
  {
    name: LinkLabels.ConnectingSite,
    prop: 'connectinginteriorsite',
    customCellName: 'linkCellConnectingSiteCell'
  },

  {
    name: LinkLabels.Cost,
    prop: 'cost',
    modifier: 'fitContent'
  },

  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const VanColumns: SKColumn<ApplicationNetworkResponse>[] = [
  {
    name: VanLabels.Name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: VanLabels.Lifecycle,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: VanLabels.BackBone,
    prop: 'backbonename'
  },
  {
    name: VanLabels.EndTime,
    prop: 'endtime'
  },
  {
    name: VanLabels.DeleteDelay,
    prop: 'deletedelay',
    customCellName: 'deleteDelayCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const invitationColumns: SKColumn<InvitationResponse>[] = [
  {
    name: InvitationLabels.Name,
    prop: 'name'
  },
  {
    name: InvitationLabels.Lifecycle,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: InvitationLabels.MemberClass,
    prop: 'memberclass',
    customCellName: 'emptyCell'
  },
  {
    name: InvitationLabels.DeadLine,
    prop: 'joindeadline',
    customCellName: 'emptyCell'
  },
  {
    name: InvitationLabels.Count,
    prop: 'instancecount',
    customCellName: 'emptyCell'
  },
  {
    name: InvitationLabels.Limit,
    prop: 'instancelimit',
    customCellName: 'emptyCell'
  },
  {
    name: InvitationLabels.Interactive,
    prop: 'interactive',
    customCellName: 'emptyCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];
export const memberColumns: SKColumn<MemberSiteResponse>[] = [
  {
    name: MemberLabels.Name,
    prop: 'name'
  },
  {
    name: MemberLabels.Lifecycle,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },

  {
    name: MemberLabels.FirstActiveTime,
    prop: 'firstactivetime',
    customCellName: 'dateCell'
  },
  {
    name: MemberLabels.LastHeartbeat,
    prop: 'lastheartbeat',
    customCellName: 'dateCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const DeploymentStatusColorHexMap = {
  [DeploymentStates.NotReady]: hexColors.Red500,
  [DeploymentStates.ReadyBootstrap]: hexColors.Orange100,
  [DeploymentStates.ReadyAutomatic]: hexColors.Purple500,
  [DeploymentStates.Deployed]: hexColors.Green500
};
