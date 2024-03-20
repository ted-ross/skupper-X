import { FC } from 'react';

import { Tooltip } from '@patternfly/react-core';

import skupperProcessSVG from '@assets/skupper.svg';

import './ResourceIcon.css';

interface ResourceIconProps {
  type: 'site' | 'backbone' | 'link' | 'van' | 'invitation';
}

const RESOURCE_MAP = {
  site: { class: 'sk-resource-site', symbol: 'S' },
  backbone: { class: 'sk-resource-process-group', symbol: 'B' },
  link: { class: 'sk-resource-process', symbol: 'L' },
  van: { class: 'sk-resource-van', symbol: 'V' },
  invitation: { class: 'sk-resource-invitation', symbol: 'I' }
};

const ResourceIcon: FC<ResourceIconProps> = function ({ type }) {
  return (
    <Tooltip content={`resource type: ${type}`}>
      <span role={`${type}-resource-icon`} className={`sk-resource-icon ${RESOURCE_MAP[type].class}`}>
        {RESOURCE_MAP[type].symbol || <img src={skupperProcessSVG} alt={'Skupper Icon'} />}
      </span>
    </Tooltip>
  );
};

export default ResourceIcon;
