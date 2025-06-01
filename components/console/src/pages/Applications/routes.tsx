import { lazy } from 'react';
import { ApplicationPaths } from './Applications.constants';

const ApplicationsPage = lazy(() => import(/* webpackChunkName: "applications" */ './views/Applications'));

export const applicationsRoutes = [
  {
    path: ApplicationPaths.path,
    element: <ApplicationsPage />
  }
];
