import { Navigate, RouteObject } from 'react-router-dom';

import { DEFAULT_ROUTE } from '@config/routes';
import { backboneRoutes } from '@pages/Backbones/routes';
import { errorsRoutes } from '@pages/shared/Errors/routes';
import { vansRoutes } from '@pages/Vans/routes';

export const routes: RouteObject[] = [
  { index: true, element: <Navigate to={DEFAULT_ROUTE} replace={true} /> },
  ...errorsRoutes,
  ...backboneRoutes,
  ...vansRoutes
];
