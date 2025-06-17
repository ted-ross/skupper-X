import { BackbonesPaths } from '../pages/Backbones/Backbones.constants';
import { VansPaths } from '../pages/Vans/Vans.constants';
import { LibraryPaths } from '../pages/Libraries/Libraries.constants';
import { TopologyPaths } from '../pages/Topology/Topology.constants';
import { ApplicationPaths } from '../pages/Applications/Applications.constants';
import labels from '../core/config/labels.json';
import { DeploymentPaths } from '../pages/Deployment/Deployments.constants';

// Navigation groupings for sidebar
export const NAV_GROUPS = [
  {
    label: labels.navigation.network,
    items: [
      { path: TopologyPaths.path, name: TopologyPaths.name },
      { path: BackbonesPaths.path, name: BackbonesPaths.name },
      { path: VansPaths.path, name: VansPaths.name }
    ]
  },
  {
    label: labels.navigation.inventory,
    items: [
      { path: LibraryPaths.path, name: LibraryPaths.name },
      { path: ApplicationPaths.path, name: ApplicationPaths.name }
    ]
  },
  {
    label: labels.navigation.runtime,
    items: [{ path: DeploymentPaths.path, name: DeploymentPaths.name }]
  }
];

// Single items (not in groups) - currently empty
export const NAV_SINGLE_ITEMS = [];
