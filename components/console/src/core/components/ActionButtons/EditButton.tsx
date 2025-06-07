import { FC } from 'react';

import { Button } from '@patternfly/react-core';
import { EditIcon } from '@patternfly/react-icons';
import labels from '../../config/labels';

export interface EditButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'warning' | 'link' | 'plain' | 'control';
}

/**
 * Reusable Edit button component
 * Provides consistent edit action across the application
 */
export const EditButton: FC<EditButtonProps> = ({ onClick, disabled = false, isLoading = false, variant = 'link' }) => (
  <Button variant={variant} onClick={onClick} icon={<EditIcon />} isDisabled={disabled} isLoading={isLoading}>
    {labels.buttons.edit}
  </Button>
);

export default EditButton;
