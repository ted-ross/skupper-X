import { lazy } from 'react';

import { TopologyPaths } from './Topology.constants';

const Topology = lazy(() => import(/* webpackChunkName: "topology" */ './views/Topology'));

export const topologyRoutes = [
  {
    path: TopologyPaths.path,
    element: <Topology />
  }
];
