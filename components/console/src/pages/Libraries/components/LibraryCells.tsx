import { LibraryBlockResponse } from '../../../API/REST.interfaces';
import { ActionButtons } from '../../../core/components/ActionButtons';
import { LinkCellProps } from '../../../core/components/LinkCell';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import { SKUPPERX_TYPE_PREFIX } from '../../Vans/Vans.constants';

export const EmptyCell = function ({ value }: LinkCellProps<LibraryBlockResponse>) {
  return <span>{value || '-'}</span>;
};

export const TypeCell = function ({ data }: LinkCellProps<LibraryBlockResponse>) {
  const displayType = data.type.replace(SKUPPERX_TYPE_PREFIX, '');

  return <span>{displayType}</span>;
};

export const DateCell = function ({ value }: { value: string }) {
  return <LocaleDateTimeCell value={value} isTableCell={true} compact={true} />;
};

interface LibraryActionsProps {
  data: LibraryBlockResponse;
  onDelete: (id: string) => void;
}

export const LibraryActions = function ({ data, onDelete }: LibraryActionsProps) {
  return <ActionButtons data={data} onDelete={onDelete} showEdit={false} showDelete={true} isCompact={true} />;
};
