import { Button, OverflowMenu, OverflowMenuContent, OverflowMenuGroup, OverflowMenuItem } from '@patternfly/react-core';
import { EditIcon, TrashIcon } from '@patternfly/react-icons';
import React from 'react';

import { BackboneSiteResponse } from '../../../API/REST.interfaces';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import { LifecycleCell } from '../../../core/components/LifecycleCell';
import { DeploymentStatusColorHexMap } from '../Backbones.constants';
import labels from '../../../core/config/labels';

interface SiteCellProps {
  data: BackboneSiteResponse;
  value?: string;
}

export const EmptyCell = function ({ value }: { value: string }) {
  return <span>{value || '-'}</span>;
};

export const DeploymentStateCell = function ({ data }: SiteCellProps) {
  return (
    <div>
      <span
        className="color-box"
        style={{
          backgroundColor: DeploymentStatusColorHexMap[data.deploymentstate as keyof typeof DeploymentStatusColorHexMap]
        }}
      />{' '}
      {data.deploymentstate}
    </div>
  );
};

export const SiteLifecycleCell = function ({ data }: SiteCellProps) {
  return <LifecycleCell lifecycle={data.lifecycle} />;
};

export const SiteLinkCell = function ({
  data,
  value,
  onOpenDrawer
}: SiteCellProps & { onOpenDrawer?: (site: BackboneSiteResponse) => void }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenDrawer) onOpenDrawer(data);
  };
  return (
    <span
      style={{
        cursor: onOpenDrawer ? 'pointer' : 'default',
        color: 'var(--pf-global--link--Color, #06c)',
        textDecoration: 'none',
        outline: 'none',
        transition: 'color 0.15s',
        fontWeight: 400
      }}
      onClick={onOpenDrawer ? handleClick : undefined}
      tabIndex={onOpenDrawer ? 0 : -1}
      role={onOpenDrawer ? 'button' : undefined}
      aria-label={data.name}
      onKeyDown={
        onOpenDrawer
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDrawer(data);
              }
            }
          : undefined
      }
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--pf-global--link--Color--hover, #004080)';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--pf-global--link--Color, #06c)';
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--pf-global--link--Color--hover, #004080)';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--pf-global--link--Color, #06c)';
      }}
    >
      {value || data.name}
    </span>
  );
};

export const DateCell = function ({ value }: { value: string }) {
  return <LocaleDateTimeCell value={value} isTableCell={true} compact={true} />;
};

interface SiteActionsProps {
  data: BackboneSiteResponse;
  onEdit: (site: BackboneSiteResponse) => void;
  onDelete: (id: string) => void;
}

export const SiteActions = function ({ data, onEdit, onDelete }: SiteActionsProps) {
  return (
    <OverflowMenu breakpoint="lg">
      <OverflowMenuContent>
        <OverflowMenuGroup groupType="button">
          <OverflowMenuItem>
            <Button variant="link" onClick={() => onEdit(data)} icon={<EditIcon />}>
              {labels.buttons.edit}
            </Button>
          </OverflowMenuItem>
          <OverflowMenuItem>
            <Button variant="link" onClick={() => onDelete(data.id)} icon={<TrashIcon />} isDanger>
              {labels.buttons.delete}
            </Button>
          </OverflowMenuItem>
        </OverflowMenuGroup>
      </OverflowMenuContent>
    </OverflowMenu>
  );
};
