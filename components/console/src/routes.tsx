import { Navigate, RouteObject } from 'react-router-dom';

import { DEFAULT_ROUTE } from './config/routes';
import { backboneRoutes } from './pages/Backbones/routes';
import { librariesRoutes } from './pages/Libraries/routes';
import { vansRoutes } from './pages/Vans/routes';
import { applicationsRoutes } from './pages/Applications/routes';
import { topologyRoutes } from './pages/Topology/routes';

export const routes: RouteObject[] = [
  { index: true, element: <Navigate to={DEFAULT_ROUTE} replace={true} /> },
  ...topologyRoutes,
  ...backboneRoutes,
  ...librariesRoutes,
  ...vansRoutes,
  ...applicationsRoutes
];
