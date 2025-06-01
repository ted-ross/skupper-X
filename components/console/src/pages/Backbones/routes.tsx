import { lazy } from 'react';

import { RoutesPaths } from './Backbones.enum';

const Backbones = lazy(() => import(/* webpackChunkName: "backbones" */ './views/Backbones'));
const Backbone = lazy(() => import(/* webpackChunkName: "backbone" */ './views/Backbone'));

export const backboneRoutes = [
  {
    path: RoutesPaths.Backbones,
    element: <Backbones />
  },
  {
    path: `${RoutesPaths.Backbones}/:id`,
    element: <Backbone />
  }
];
