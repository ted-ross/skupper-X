import { lazy } from 'react';

import { VansPaths } from './Vans.constants';

const Vans = lazy(() => import(/* webpackChunkName: "vans" */ './views/Vans'));
const Van = lazy(() => import(/* webpackChunkName: "van-details" */ './views/Van'));

export const vansRoutes = [
  {
    path: VansPaths.path,
    element: <Vans />
  },
  {
    path: `${VansPaths.path}/:id`,
    element: <Van />
  }
];
