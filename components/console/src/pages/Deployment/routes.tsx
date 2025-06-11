import { lazy } from 'react';

import { DeploymentPaths } from './Deployments.constants';

const Deployments = lazy(() => import(/* webpackChunkName: "deployment" */ './views/Deployments'));

export const deploymentRoutes = [
  {
    path: DeploymentPaths.path,
    element: <Deployments />
  }
];
