import { lazy } from 'react';

import { RoutesPaths } from './Backbones.enum';
import InvitationsContainer from './views/Invitations';
import SiteContainer from './views/Site';

const Backbones = lazy(() => import(/* webpackChunkName: "backbones" */ './views/Backbones'));
const Backbone = lazy(() => import(/* webpackChunkName: "backbone" */ './views/Backbone'));

export const backboneRoutes = [
  {
    path: RoutesPaths.App,
    element: <Backbones />
  },
  {
    path: `${RoutesPaths.App}/sites/:id`,
    element: <Backbone />
  },
  {
    path: `${RoutesPaths.App}/sites/:bid/:sid`,
    element: <SiteContainer />
  },
  {
    path: `${RoutesPaths.App}/invitations/:vid`,
    element: <InvitationsContainer />
  }
];
