import { FC } from 'react';

import { Button } from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';
import labels from '../../config/labels';

export interface DeleteButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'warning' | 'link' | 'plain' | 'control';
}

/**
 * Reusable Delete button component
 * Provides consistent delete action across the application
 */
export const DeleteButton: FC<DeleteButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  variant = 'link'
}) => (
  <Button variant={variant} onClick={onClick} icon={<TrashIcon />} isDanger isDisabled={disabled} isLoading={isLoading}>
    {isLoading ? labels.buttons.deleting : labels.buttons.delete}
  </Button>
);

export default DeleteButton;
