import { FC, ReactNode } from 'react';

import { Button, OverflowMenu, OverflowMenuContent, OverflowMenuGroup, OverflowMenuItem } from '@patternfly/react-core';
import { EditIcon, TrashIcon } from '@patternfly/react-icons';
import labels from '../../../core/config/labels';

// Re-export individual button components
export { EditButton } from './EditButton';
export { DeleteButton } from './DeleteButton';
export { CreateButton } from './CreateButton';

export interface ActionButtonsProps<T = { id: string }> {
  /** The data item for this row */
  data: T;
  /** Callback when edit is clicked */
  onEdit?: (item: T) => void;
  /** Callback when delete is clicked */
  onDelete?: (id: string) => void;
  /** Additional custom actions */
  customActions?: {
    label: string;
    icon?: ReactNode;
    onClick: (item: T) => void;
    variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'warning' | 'link' | 'plain' | 'control';
    isDanger?: boolean;
    isDisabled?: boolean;
  }[];
  /** Whether to show edit action */
  showEdit?: boolean;
  /** Whether to show delete action */
  showDelete?: boolean;
  /** Whether to use compact layout (for smaller spaces) */
  isCompact?: boolean;
}

/**
 * Reusable action buttons component for table rows and cards
 * Provides consistent edit/delete/custom actions across the application
 */
export const ActionButtons: FC<ActionButtonsProps> = function ({
  data,
  onEdit,
  onDelete,
  customActions = [],
  showEdit = true,
  showDelete = true,
  isCompact = false
}) {
  const hasActions = (showEdit && onEdit) || (showDelete && onDelete) || customActions.length > 0;

  if (!hasActions) {
    return null;
  }

  const editAction = showEdit && onEdit && (
    <OverflowMenuItem key="edit">
      <Button variant="link" onClick={() => onEdit(data)} icon={<EditIcon />}>
        {labels.buttons.edit}
      </Button>
    </OverflowMenuItem>
  );

  const deleteAction = showDelete && onDelete && (
    <OverflowMenuItem key="delete">
      <Button variant="link" onClick={() => onDelete(data.id)} icon={<TrashIcon />} isDanger>
        {labels.buttons.delete}
      </Button>
    </OverflowMenuItem>
  );

  const customActionItems = customActions.map((action, index) => (
    <OverflowMenuItem key={`custom-${index}`}>
      <Button
        variant={action.variant || 'link'}
        onClick={() => action.onClick(data)}
        icon={action.icon}
        isDanger={action.isDanger}
        isDisabled={action.isDisabled}
      >
        {action.label}
      </Button>
    </OverflowMenuItem>
  ));

  return (
    <OverflowMenu breakpoint={isCompact ? 'md' : 'lg'}>
      <OverflowMenuContent>
        <OverflowMenuGroup groupType="button">
          {editAction}
          {customActionItems}
          {deleteAction}
        </OverflowMenuGroup>
      </OverflowMenuContent>
    </OverflowMenu>
  );
};

export default ActionButtons;
