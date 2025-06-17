import { FC, ReactNode } from 'react';

import { Toolbar, ToolbarContent, ToolbarItem, ToolbarGroup, Button, Title } from '@patternfly/react-core';
import { PlusIcon } from '@patternfly/react-icons';

export interface ToolbarAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'warning' | 'link' | 'plain' | 'control';
  isDisabled?: boolean;
}

export interface ToolbarActionsProps {
  /** Page/section title */
  title?: string;
  /** Page/section description */
  description?: string;
  /** Primary action (usually create/add) */
  primaryAction?: ToolbarAction;
  /** Secondary actions */
  secondaryActions?: ToolbarAction[];
  /** Custom content on the left side */
  leftContent?: ReactNode;
  /** Custom content on the right side */
  rightContent?: ReactNode;
  /** Whether to align secondary actions to the right */
  alignSecondaryRight?: boolean;
}

/**
 * Reusable toolbar component that provides consistent action patterns
 * Handles common toolbar layouts with title, description, and actions
 */
export const ToolbarActions: FC<ToolbarActionsProps> = function ({
  title,
  description,
  primaryAction,
  secondaryActions = [],
  leftContent,
  rightContent,
  alignSecondaryRight = true
}) {
  const renderAction = (action: ToolbarAction, key: string) => (
    <Button
      key={key}
      variant={action.variant || 'secondary'}
      icon={action.icon}
      onClick={action.onClick}
      isDisabled={action.isDisabled}
    >
      {action.label}
    </Button>
  );

  const primaryButton = primaryAction && renderAction(primaryAction, 'primary');
  const secondaryButtons = secondaryActions.map((action, index) => renderAction(action, `secondary-${index}`));

  return (
    <Toolbar>
      <ToolbarContent>
        {/* Left side content */}
        {leftContent && <ToolbarItem>{leftContent}</ToolbarItem>}

        {/* Title */}
        {title && (
          <ToolbarItem>
            <div>
              <Title headingLevel="h2">{title}</Title>
              {description && <p className="pf-u-mb-0 pf-u-color-200 pf-u-font-size-sm">{description}</p>}
            </div>
          </ToolbarItem>
        )}

        {/* Secondary actions (left-aligned if not alignSecondaryRight) */}
        {!alignSecondaryRight && secondaryButtons.length > 0 && (
          <ToolbarGroup>
            {secondaryButtons.map((button) => (
              <ToolbarItem key={button.key}>{button}</ToolbarItem>
            ))}
          </ToolbarGroup>
        )}

        {/* Right-aligned actions */}
        <ToolbarGroup align={{ default: 'alignEnd' }}>
          {/* Secondary actions (right-aligned) */}
          {alignSecondaryRight &&
            secondaryButtons.map((button) => <ToolbarItem key={button.key}>{button}</ToolbarItem>)}

          {/* Primary action */}
          {primaryButton && <ToolbarItem>{primaryButton}</ToolbarItem>}

          {/* Custom right content */}
          {rightContent && <ToolbarItem>{rightContent}</ToolbarItem>}
        </ToolbarGroup>
      </ToolbarContent>
    </Toolbar>
  );
};

/**
 * Quick helper for common "Create" button toolbar
 */
export const CreateToolbar: FC<{
  title: string;
  description?: string;
  createLabel?: string;
  onCreate: () => void;
  customActions?: ToolbarAction[];
}> = function ({ title, description, createLabel = 'Create', onCreate, customActions = [] }) {
  return (
    <ToolbarActions
      title={title}
      description={description}
      primaryAction={{
        label: createLabel,
        onClick: onCreate,
        icon: <PlusIcon />,
        variant: 'primary'
      }}
      secondaryActions={customActions}
    />
  );
};

export default ToolbarActions;
