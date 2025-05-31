import { ComponentType, FC } from 'react';

import { Bullseye, EmptyState, EmptyStateBody, EmptyStateVariant } from '@patternfly/react-core';

import { EmptyDataLabels } from './EmptyData.enum';

interface EmptyDataProps {
  message?: string;
  description?: string;
  icon?: ComponentType;
}

const EmptyData: FC<EmptyDataProps> = function ({ message = EmptyDataLabels.Default, description }) {
  return (
    <Bullseye>
      <EmptyState title={message} variant={EmptyStateVariant.sm} isFullHeight>
        {description && <EmptyStateBody>{description}</EmptyStateBody>}
      </EmptyState>
    </Bullseye>
  );
};

export default EmptyData;
