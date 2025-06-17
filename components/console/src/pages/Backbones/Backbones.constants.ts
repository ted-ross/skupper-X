import { RoutesPaths, DeploymentStates } from './Backbones.enum';
import labels from '../../core/config/labels';
import {
  BackboneResponse,
  InvitationResponse,
  LinkResponse,
  MemberSiteResponse,
  BackboneSiteResponse
} from '../../API/REST.interfaces';
import { hexColors } from '../../config/colors';
import { SKColumn } from '../../core/components/SkTable/SkTable.interfaces';

export const BackbonesPaths = {
  path: RoutesPaths.Backbones,
  name: labels.navigation.backbones
};

export const backboneColumns: SKColumn<BackboneResponse>[] = [
  {
    name: labels.forms.name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: labels.forms.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: labels.forms.manage,
    prop: 'multitenant',
    customCellName: 'booleanCell'
  },
  {
    name: labels.errors.generic,
    prop: 'failure',
    customCellName: 'failure'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const siteColumns: SKColumn<BackboneSiteResponse>[] = [
  {
    name: labels.columns.name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: labels.columns.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: labels.columns.deploymentStatus,
    prop: 'deploymentstate',
    customCellName: 'deploymentStateCell'
  },
  {
    name: labels.generic.lastHeartbeat,
    prop: 'lastheartbeat',
    customCellName: 'DateCell'
  },
  {
    name: labels.generic.firstActive,
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
    name: labels.forms.peer,
    prop: 'connectinginteriorsite',
    customCellName: 'linkCellConnectingSiteCell'
  },
  {
    name: labels.forms.revision,
    prop: 'cost',
    modifier: 'fitContent'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const invitationColumns: SKColumn<InvitationResponse>[] = [
  {
    name: labels.forms.name,
    prop: 'name'
  },
  {
    name: labels.forms.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: labels.forms.member,
    prop: 'memberclasses',
    customCellName: 'emptyCell'
  },
  {
    name: labels.forms.revision,
    prop: 'joindeadline',
    customCellName: 'emptyCell'
  },
  {
    name: labels.forms.revision,
    prop: 'instancecount',
    customCellName: 'emptyCell'
  },
  {
    name: labels.forms.revision,
    prop: 'instancelimit',
    customCellName: 'emptyCell'
  },
  {
    name: labels.forms.manage,
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
    name: labels.forms.name,
    prop: 'name'
  },
  {
    name: labels.forms.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: labels.forms.revision,
    prop: 'firstactivetime',
    customCellName: 'dateCell'
  },
  {
    name: labels.forms.revision,
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
