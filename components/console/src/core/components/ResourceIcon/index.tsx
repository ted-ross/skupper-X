import { FC } from 'react';

import { Tooltip } from '@patternfly/react-core';

import skupperProcessSVG from '../../../assets/skupper.svg';
import { hexColors } from '../../../config/colors';

import './ResourceIcon.css';

interface ResourceIconProps {
  type: 'site' | 'backbone' | 'link' | 'van' | 'invitation' | 'accessPoint' | 'library' | 'application' | 'deployment';
}

const RESOURCE_MAP = {
  backbone: {
    class: 'sk-resource-backbone',
    symbol: 'B',
    style: { background: hexColors.Blue400, color: hexColors.White }
  },
  van: {
    class: 'sk-resource-van',
    symbol: 'V',
    style: { background: hexColors.Orange700, color: hexColors.White }
  },
  site: {
    class: 'sk-resource-site',
    symbol: 'S',
    style: { background: hexColors.Teal500, color: hexColors.White }
  },
  accessPoint: {
    class: 'sk-resource-ap',
    symbol: 'AP',
    style: { background: hexColors.Red600, color: hexColors.White }
  },
  link: {
    class: 'sk-resource-link',
    symbol: 'L',
    style: { background: hexColors.Purple300, color: hexColors.Black900 }
  },
  invitation: {
    class: 'sk-resource-invitation',
    symbol: 'I',
    style: { background: hexColors.Green500, color: hexColors.White }
  },
  library: {
    class: 'sk-resource-library',
    symbol: 'LIB',
    style: { background: hexColors.Purple700, color: hexColors.White }
  },
  application: {
    class: 'sk-resource-applcation',
    symbol: 'A',
    style: { background: hexColors.Blue100, color: hexColors.Black900 }
  },
  deployment: {
    class: 'sk-resource-deployment',
    symbol: 'D',
    style: { background: hexColors.Cyan500, color: hexColors.White }
  }
};

const ResourceIcon: FC<ResourceIconProps> = function ({ type }) {
  return (
    <Tooltip content={`resource type: ${type}`}>
      <span role={`${type}-resource-icon`} className={`sk-resource-icon`} style={RESOURCE_MAP[type].style}>
        {RESOURCE_MAP[type].symbol || <img src={skupperProcessSVG} alt={'Skupper Icon'} />}
      </span>
    </Tooltip>
  );
};

export default ResourceIcon;
