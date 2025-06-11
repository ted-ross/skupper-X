import { BackbonesPaths } from '../pages/Backbones/Backbones.constants';
import { VansPaths } from '../pages/Vans/Vans.constants';
import { TopologyPaths } from '../pages/Topology/Topology.constants';

// Navigation config
export const ROUTES = [TopologyPaths, BackbonesPaths, VansPaths];
export const DEFAULT_ROUTE = ROUTES[0].path;
