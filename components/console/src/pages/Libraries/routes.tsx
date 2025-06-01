import { lazy } from 'react';

import { LibraryPaths } from './Libraries.constants';

const Libraries = lazy(() => import(/* webpackChunkName: "libraries" */ './views/Libraries'));
const Library = lazy(() => import(/* webpackChunkName: "library" */ './views/Library'));

export const librariesRoutes = [
  {
    path: LibraryPaths.path,
    element: <Libraries />
  },
  {
    path: `${LibraryPaths.path}/:id`,
    element: <Library />
  }
];
