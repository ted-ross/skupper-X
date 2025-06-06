import { Label } from '@patternfly/react-core';
import { CodeBranchIcon } from '@patternfly/react-icons';

import { DeploymentResponse } from '../../../API/REST.interfaces';
import { DeploymentLifecycle } from '../Deployments.enum';
import { ActionButtons } from '../../../core/components/ActionButtons';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';

/**
 * Empty cell component for deployment table
 */
export const EmptyCell = ({ data }: { data: string }) => (data ? data : '-');

/**
 * Application link cell component
 */
export const AppLinkCell = ({ data }: { data: DeploymentResponse }) => (
  <span className="sk-link-cell">
    <CodeBranchIcon className="sk-icon-margin" />
    {data.appname || '-'}
  </span>
);

/**
 * Date cell component for deployment table
 */
export const DateCell = ({ data }: { data: string }) => (
  <LocaleDateTimeCell value={data} isTableCell={true} compact={true} />
);

/**
 * Lifecycle status cell component
 */
export const LifecycleCell = ({ data }: { data: DeploymentResponse }) => {
  const getVariant = (lifecycle: string) => {
    switch (lifecycle) {
      case DeploymentLifecycle.Active:
        return 'green';
      case DeploymentLifecycle.Pending:
        return 'orange';
      case DeploymentLifecycle.Failed:
        return 'red';
      case DeploymentLifecycle.Inactive:
      default:
        return 'grey';
    }
  };

  return (
    <Label variant="outline" color={getVariant(data.lifecycle)}>
      {data.lifecycle || 'unknown'}
    </Label>
  );
};

/**
 * Actions cell component for deployment table
 */
export const DeploymentActions = ({ data, onDelete }: { data: DeploymentResponse; onDelete: (id: string) => void }) => {
  return <ActionButtons data={data} onDelete={onDelete} showEdit={false} showDelete={true} isCompact={true} />;
};
