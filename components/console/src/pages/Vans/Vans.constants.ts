import labels from '../../core/config/labels';
import { SKColumn } from '../../core/components/SkTable/SkTable.interfaces';
import { VanResponse } from '../../API/REST.interfaces';
import { RoutesPaths } from './Vans.enum';

export const VansPaths = {
  path: RoutesPaths.Vans,
  name: labels.navigation.vans
};

export const SKUPPERX_TYPE_PREFIX = 'skupperx.io/';

export const VanColumns: SKColumn<VanResponse>[] = [
  {
    name: labels.columns.name,
    prop: 'name',
    customCellName: 'linkCell'
  },
  {
    name: labels.columns.backbones,
    prop: 'backboneid',
    customCellName: 'backboneCell'
  },
  {
    name: labels.columns.status,
    prop: 'lifecycle',
    customCellName: 'lifecycleCell'
  },
  {
    name: labels.columns.startTime,
    prop: 'starttime',
    customCellName: 'startTimeCell'
  },
  {
    name: labels.columns.endTime,
    prop: 'endtime',
    customCellName: 'endTimeCell'
  },
  {
    name: '',
    modifier: 'fitContent',
    customCellName: 'actions'
  }
];
