import { FC } from 'react';

import { Flex, FlexItem, Title } from '@patternfly/react-core';

import ResourceIcon from '../ResourceIcon';

export interface TitleSectionProps {
  /** The name/title to display */
  title: string;
  /** The type of resource icon to display (optional) */
  resourceType?: 'link' | 'site' | 'backbone' | 'van' | 'invitation' | 'accessPoint' | 'library' | 'deployment';
  /** The heading level for semantic HTML */
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

const TitleSection: FC<TitleSectionProps> = ({ title, resourceType, headingLevel = 'h1' }) => (
  <Flex
    alignItems={{ default: 'alignItemsCenter' }}
    spaceItems={{ default: 'spaceItemsSm' }}
    style={{ alignItems: 'center' }}
  >
    {resourceType && (
      <FlexItem style={{ display: 'flex', alignItems: 'center' }}>
        <ResourceIcon type={resourceType} />
      </FlexItem>
    )}
    <FlexItem style={{ display: 'flex', alignItems: 'center' }}>
      <Title headingLevel={headingLevel}>{title}</Title>
    </FlexItem>
  </Flex>
);

export default TitleSection;
