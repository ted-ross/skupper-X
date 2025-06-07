import { BuildIcon, ListIcon } from '@patternfly/react-icons';
import { Spinner } from '@patternfly/react-core';

import { ApplicationResponse } from '../../../API/REST.interfaces';
import { ActionButtons } from '../../../core/components/ActionButtons';
import { LifecycleCell } from '../../../core/components/LifecycleCell';
import labels from '../../../core/config/labels.json';
import LinkCell, { LinkCellProps } from '../../../core/components/LinkCell';
import { LibraryPaths } from '../../Libraries/Libraries.constants';

export const ApplicationLifecycleCell = function ({ data }: LinkCellProps<ApplicationResponse>) {
  return <LifecycleCell lifecycle={data.lifecycle} />;
};

export const linkCell = (props: LinkCellProps<ApplicationResponse>) =>
  LinkCell({
    ...props,
    type: 'application',
    isDisabled: true
  });

export const linkCellLibrary = (props: LinkCellProps<ApplicationResponse>) =>
  LinkCell({
    ...props,
    type: 'library',
    link: `${LibraryPaths.path}/${props.data.rootname}@${props.data.rootblock}`
  });

interface ApplicationActionsProps {
  data: ApplicationResponse;
  onDelete: (id: string) => void;
  onBuild: (id: string) => void;
  isBuilding?: boolean;
  showLogButton?: boolean;
  onShowLog?: (appId: string, appName: string) => void;
}

export const ApplicationActions = function ({
  data,
  onDelete,
  onBuild,
  isBuilding = false,
  showLogButton = false,
  onShowLog
}: ApplicationActionsProps) {
  // Applications can be built if they have a lifecycle
  const canBeBuild = data.lifecycle !== undefined;
  const canShowLog = data.lifecycle && data.lifecycle !== 'created';

  // Custom actions specific to applications
  const customActions = [
    {
      label: labels.buttons.build,
      icon: isBuilding ? <Spinner size="sm" /> : <BuildIcon />,
      onClick: () => onBuild(data.id),
      variant: 'link' as const,
      isDisabled: isBuilding || !canBeBuild
    }
  ];

  // Add log button if requested
  if (showLogButton && onShowLog) {
    customActions.push({
      label: labels.buttons.showLog,
      icon: <ListIcon />,
      onClick: () => onShowLog(data.id, data.name),
      variant: 'link' as const,
      isDisabled: !canShowLog
    });
  }

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
