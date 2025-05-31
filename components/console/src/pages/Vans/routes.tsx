import { lazy } from 'react';

import { VansPaths } from './Vans.constants';

const VansPage = lazy(() => import(/* webpackChunkName: "vans" */ '../../pages/Backbones/views/Vans'));

export const vansRoutes = [
  {
    path: VansPaths.path,
    element: <VansPage />
  }
];
