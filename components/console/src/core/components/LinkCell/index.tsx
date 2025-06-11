import { Truncate, Flex, FlexItem } from '@patternfly/react-core';
import { Link } from 'react-router-dom';

import ResourceIcon from '../ResourceIcon';

export interface LinkCellProps<T> {
  data: T;
  value: string | undefined;
  link: string;
  isDisabled?: boolean;
  type?: 'backbone' | 'site' | 'link' | 'van' | 'invitation' | 'library' | 'application' | 'deployment';
  fitContent?: boolean;
}

// Renders the value of the cell, either truncated or not depending on the fitContent prop
function renderValue(value: string, isDisabled: boolean, fitContent: boolean) {
  if (isDisabled) {
    return (
      <Truncate content={value} position={'middle'}>
        {value}
      </Truncate>
    );
  }

  return fitContent ? (
    value
  ) : (
    <Truncate content={value} position={'middle'}>
      {value}
    </Truncate>
  );
}

// A cell that contains a link to another page
const LinkCell = function <T>({ value, link, type, isDisabled = false, fitContent = false }: LinkCellProps<T>) {
  // If there is no value, display an empty string
  if (!value) {
    return <span>''</span>;
  }

  const stringValue = value.toString();

  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
      {/* If a type is provided, display a corresponding icon */}
      {type && (
        <FlexItem>
          <ResourceIcon type={type} />
        </FlexItem>
      )}
      {/* If the cell is disabled, render the value without a link */}
      <FlexItem>
        {isDisabled ? (
          renderValue(stringValue, isDisabled, fitContent)
        ) : (
          // Otherwise, render the value as a link
          <Link to={link}>{renderValue(stringValue, isDisabled, fitContent)}</Link>
        )}
      </FlexItem>
    </Flex>
  );
};

export default LinkCell;
