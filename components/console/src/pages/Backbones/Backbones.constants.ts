import {
  BackboneResponse,
  InvitationResponse,
  LinkResponse,
  MemberResponse,
  SiteResponse,
  VanResponse
} from '@API/REST.interfaces';
import { HexColors, VarColors } from '@config/colors';
import { SKColumn } from '@core/components/SkTable/SkTable.interfaces';

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

export const siteColumns: SKColumn<SiteResponse>[] = [
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
    name: SiteLabels.FirstActiveTime,
    prop: 'firstactivetime',
    customCellName: 'DateCell'
  },
  {
    name: SiteLabels.LastHeartBeat,
    prop: 'lastheartbeat',
    customCellName: 'DateCell'
  },
  {
    name: SiteLabels.DeploymentState,
    prop: 'deploymentstate',
    customCellName: 'deploymentStateCell'
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
    name: LinkLabels.ListeningSite,
    prop: 'listeninginteriorsite',
    customCellName: 'linkCellListeningSiteCell'
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

export const VanColumns: SKColumn<VanResponse>[] = [
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
export const memberColumns: SKColumn<MemberResponse>[] = [
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
    name: MemberLabels.SiteClass,
    prop: 'siteclass',
    customCellName: 'emptyCell'
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

export const DeploymentStatusColorMap = {
  [DeploymentStates.NotReady]: VarColors.Red100,
  [DeploymentStates.ReadyBootstrap]: VarColors.Orange200,
  [DeploymentStates.ReadyAutomatic]: VarColors.Purple500,
  [DeploymentStates.Deployed]: VarColors.Green500
};

export const DeploymentStatusColorHexMap = {
  [DeploymentStates.NotReady]: HexColors.Red100,
  [DeploymentStates.ReadyBootstrap]: HexColors.Orange200,
  [DeploymentStates.ReadyAutomatic]: HexColors.Purple500,
  [DeploymentStates.Deployed]: HexColors.Green500
};
