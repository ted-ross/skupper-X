import { RoutesPaths } from './Applications.enum';
import labels from '../../core/config/labels';
import { SKColumn } from '../../core/components/SkTable/SkTable.interfaces';
import { ApplicationResponse } from '../../API/REST.interfaces';

export const ApplicationPaths = {
  path: RoutesPaths.Applications,
  name: labels.navigation.applications
};

export const applicationColumns: SKColumn<ApplicationResponse>[] = [
  {
    name: labels.forms.name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: labels.forms.rootBlock,
    prop: 'rootname',
    customCellName: 'linkCellLibrary'
  },
  {
    name: labels.forms.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: labels.forms.actions,
    prop: 'id',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];
