import labels from '../../core/config/labels';
import { DeploymentResponse } from '../../API/REST.interfaces';
import { SKColumn } from '../../core/components/SkTable/SkTable.interfaces';

import { RoutesPaths } from './Deployments.enum';

export const DeploymentPaths = {
  path: RoutesPaths.Deployment,
  name: labels.navigation.deployments
};

export const deploymentColumns: SKColumn<DeploymentResponse>[] = [
  {
    name: labels.navigation.applications,
    prop: 'appname',
    customCellName: 'appLinkCell'
  },
  {
    name: labels.navigation.vans,
    prop: 'vanname',
    customCellName: 'linkCell'
  },
  {
    name: labels.forms.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];
