import { FC, ReactElement } from 'react';

import { Icon, Content, ContentVariants } from '@patternfly/react-core';
import { ListIcon, TopologyIcon } from '@patternfly/react-icons';
import { Link } from 'react-router-dom';

const icons: Record<string, ReactElement> = {
  topologyIcon: <TopologyIcon />,
  listIcon: <ListIcon />
};

const NavigationViewLink: FC<{ link: string; linkLabel: string; iconName?: 'topologyIcon' | 'listIcon' }> = function ({
  link,
  linkLabel,
  iconName = 'topologyIcon'
}) {
  return (
    <Content>
      <Link to={link} className="pf-u-text-nowrap">
        <Content component={ContentVariants.p}>
          <Icon isInline>{icons[iconName]}</Icon> {linkLabel}
        </Content>
      </Link>
    </Content>
  );
};

export default NavigationViewLink;
