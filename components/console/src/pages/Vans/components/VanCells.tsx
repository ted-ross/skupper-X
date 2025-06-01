import { VanResponse, NetworkLifeCycleStatus } from '../../../API/REST.interfaces';
import { ActionButtons } from '../../../core/components/ActionButtons';
import LinkCell, { LinkCellProps } from '../../../core/components/LinkCell';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import { LifecycleCell } from '../../../core/components/LifecycleCell';
import { BackbonesPaths } from '../../Backbones/Backbones.constants';
import labels from '../../../core/config/labels';
import { SignOutAltIcon } from '@patternfly/react-icons';

export const VanLifecycleCell = function ({ data }: LinkCellProps<VanResponse>) {
  return <LifecycleCell lifecycle={data.lifecycle as NetworkLifeCycleStatus} />;
};

export const EmptyCell = function ({ value }: LinkCellProps<VanResponse>) {
  return <span>{value || '-'}</span>;
};

interface VanActionsProps {
  data: VanResponse;
  onDelete: (id: string) => void;
  onEvict: (id: string) => void;
}

export const VanActions = function ({ data, onDelete, onEvict }: VanActionsProps) {
  const customActions = [
    {
      label: labels.buttons.evict,
      icon: <SignOutAltIcon />,
      onClick: () => onEvict(data.id),
      variant: 'link' as const,
      isDanger: true
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

export const EndTimeCell = function ({ value }: { value: string }) {
  return <LocaleDateTimeCell value={value} isTableCell={true} placeholder="-" compact={true} />;
};

export const BackboneCell = function ({ data }: LinkCellProps<VanResponse>) {
  const backboneLink = `${BackbonesPaths.path}/${data.backbonename}@${data.backboneid}`;
  return <LinkCell data={data} value={data.backbonename} link={backboneLink} type="backbone" />;
};

export const StartTimeCell = function ({ value }: { value: string }) {
  return <LocaleDateTimeCell value={value} isTableCell={true} placeholder={labels.generic.notStarted} compact={true} />;
};
