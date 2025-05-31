import { Navigate, RouteObject } from 'react-router-dom';

import { DEFAULT_ROUTE } from './config/routes';
import { backboneRoutes } from './pages/Backbones/routes';

export const routes: RouteObject[] = [
  { index: true, element: <Navigate to={DEFAULT_ROUTE} replace={true} /> },
  ...backboneRoutes
];
