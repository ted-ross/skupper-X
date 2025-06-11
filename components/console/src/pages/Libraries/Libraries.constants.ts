import labels from '../../core/config/labels';
import { LibraryBlockResponse } from '../../API/REST.interfaces';
import { SKColumn } from '../../core/components/SkTable/SkTable.interfaces';
import {
  CogIcon,
  ConnectedIcon,
  CodeIcon,
  HistoryIcon,
  FlaskIcon,
  AngleDownIcon,
  AngleRightIcon,
  PlusIcon,
  TrashIcon
} from '@patternfly/react-icons';
import { RoutesPaths } from './Libraries.enum';

export const LibraryPaths = {
  path: RoutesPaths.Libraries,
  name: labels.navigation.libraries
};

export const libraryColumns: SKColumn<LibraryBlockResponse>[] = [
  {
    name: labels.columns.name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: labels.columns.provider,
    prop: 'provider',
    customCellName: 'emptyCell'
  },
  {
    name: labels.columns.type,
    prop: 'type',
    customCellName: 'typeCell'
  },
  {
    name: labels.columns.revision,
    prop: 'revision'
  },
  {
    name: labels.columns.bodyStyle,
    prop: 'bodystyle'
  },
  {
    name: labels.columns.created,
    prop: 'created',
    customCellName: 'dateCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];

export const LIBRARY_SECTION_ICONS = {
  configuration: CogIcon,
  interfaces: ConnectedIcon,
  body: CodeIcon,
  test: FlaskIcon,
  history: HistoryIcon
} as const;

export const INTERFACE_OPERATION_ICONS = {
  expand: AngleDownIcon,
  collapse: AngleRightIcon,
  add: PlusIcon,
  delete: TrashIcon
} as const;

export const TARGET_PLATFORMS = ['kubernetes', 'docker', 'sk2', 'openshift'] as const;

export const AFFINITY_OPTIONS = [
  'cpu-intensive',
  'memory-intensive',
  'network-intensive',
  'storage-intensive'
] as const;
