import { FC, ReactNode } from 'react';

import { Button } from '@patternfly/react-core';
import { PlusIcon } from '@patternfly/react-icons';

export interface CreateButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'warning' | 'link' | 'plain' | 'control';
  showIcon?: boolean;
  icon?: ReactNode;
}

/**
 * Reusable Create button component
 * Provides consistent create action across the application
 */
export const CreateButton: FC<CreateButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  children = 'Create',
  variant = 'primary',
  showIcon = true,
  icon
}) => (
  <Button
    variant={variant}
    onClick={onClick}
    icon={showIcon ? icon || <PlusIcon /> : undefined}
    isDisabled={disabled}
    isLoading={isLoading}
  >
    {children}
  </Button>
);

export default CreateButton;
