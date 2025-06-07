import { Icon } from '@patternfly/react-core';
import { UsersIcon, PlayIcon } from '@patternfly/react-icons';

import { BackboneResponse, NetworkLifeCycleStatus } from '../../../API/REST.interfaces';
import { hexColors } from '../../../config/colors';
import { ActionButtons } from '../../../core/components/ActionButtons';
import { LifecycleCell } from '../../../core/components/LifecycleCell';
import labels from '../../../core/config/labels';
import { LinkCellProps } from '../../../core/components/LinkCell';

export const BackboneLifecycleCell = function ({ data }: LinkCellProps<BackboneResponse>) {
  return <LifecycleCell lifecycle={data.lifecycle as NetworkLifeCycleStatus} />;
};

export const MultitenantCell = function ({ data }: LinkCellProps<BackboneResponse>) {
  const isMulti = data.multitenant;

  return (
    <div>
      <Icon iconSize="md" isInline className="pf-u-align-items-center">
        <UsersIcon
          color={isMulti ? hexColors.Green500 : hexColors.Black300}
          aria-label={isMulti ? `${labels.generic.enabled.toLowerCase()}` : `${labels.generic.disabled.toLowerCase()}`}
        />
      </Icon>{' '}
      <span style={{ color: isMulti ? hexColors.Green500 : hexColors.Black300 }}>
        {isMulti ? labels.generic.yes : labels.generic.no}
      </span>
    </div>
  );
};

interface BackboneActionsProps {
  data: BackboneResponse;
  onDelete: (id: string) => void;
  onActivate: (id: string) => void;
  isActivating?: boolean;
}

export const BackboneActions = function ({ data, onDelete, onActivate, isActivating = false }: BackboneActionsProps) {
  // Determine if backbone can be activated based on lifecycle state
  const canBeActivated = data.lifecycle === 'partial';

  // Always show activate button regardless of backbone lifecycle state
  const customActions = [
    {
      label: labels.buttons.activate,
      icon: <PlayIcon />,
      onClick: () => onActivate(data.id),
      variant: 'link' as const,
      isDisabled: isActivating || !canBeActivated
    }
  ];

  return (
    <ActionButtons
      data={data}
      onDelete={onDelete}
      customActions={customActions}
      showEdit={false}
      showDelete={true}
      isCompact={true}
    />
  );
};

export const FailureCell = function ({ value }: { value: string | null }) {
  return <span>{value && value.trim() ? value : '-'}</span>;
};

// Overview-specific multitenant cell (simplified version for detail views)
export const OverviewMultitenantCell = function ({ backbone }: { backbone: BackboneResponse }) {
  const isMulti = backbone.multitenant;

  return (
    <div>
      <Icon iconSize="md" isInline className="pf-u-align-items-center">
        <UsersIcon
          color={isMulti ? hexColors.Green500 : hexColors.Black300}
          aria-label={
            isMulti
              ? `Multitenant ${labels.generic.enabled.toLowerCase()}`
              : `Multitenant ${labels.generic.disabled.toLowerCase()}`
          }
        />
      </Icon>{' '}
      <span style={{ color: isMulti ? hexColors.Green500 : hexColors.Black300 }}>
        {isMulti ? labels.generic.yes : labels.generic.no}
      </span>
    </div>
  );
};
