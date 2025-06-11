import { useCallback } from 'react';

import {
  Alert,
  AlertActionCloseButton,
  ModalVariant,
  Toolbar,
  ToolbarContent,
  ToolbarItem
} from '@patternfly/react-core';

import { CreateButton } from '../../../core/components/ActionButtons';
import { VanResponse } from '../../../API/REST.interfaces';
import { DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import LinkCell, { LinkCellProps } from '../../../core/components/LinkCell';
import { ModalWrapper } from '../../../core/components/ModalWrapper';
import SkTable from '../../../core/components/SkTable';
import { useModal } from '../../../core/hooks/useModal';
import { VanLifecycleCell, EmptyCell, VanActions, EndTimeCell, BackboneCell, StartTimeCell } from './VanCells';
import VanForm from './VanForm';
import { useVanOperations } from '../hooks/useVanOperations';
import { VanColumns, VansPaths } from '../Vans.constants';
import labels from '../../../core/config/labels';

/**
 * VanList component handles the list view of all vans
 * Manages its own state for modals and data operations
 */
const VanList = function () {
  // Modal state management
  const { isOpen: isVanOpen, openModal: handleOpenVanModal, closeModal: handleCloseVanModal } = useModal();

  // Data operations
  const {
    vans,
    error: vanValidated,
    deleteVan: handleVanDelete,
    evictVan: handleVanEvict,
    refreshVans,
    clearError
  } = useVanOperations();

  const handleVanRefresh = useCallback(() => {
    refreshVans();
    handleCloseVanModal();
  }, [refreshVans, handleCloseVanModal]);

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <CreateButton onClick={handleOpenVanModal}>{labels.buttons.createVansTitle}</CreateButton>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {vanValidated && (
        <Alert
          variant="danger"
          title={vanValidated}
          isInline
          actionClose={<AlertActionCloseButton onClose={clearError} />}
        />
      )}

      <SkTable
        columns={VanColumns}
        rows={vans}
        paginationPageSize={DEFAULT_PAGINATION_SIZE}
        pagination={true}
        customCells={{
          linkCell: (props: LinkCellProps<VanResponse>) =>
            LinkCell({
              ...props,
              type: 'van',
              link: `${VansPaths.path}/${props.data.name}@${props.data.id}`
            }),

          backboneCell: BackboneCell,

          emptyCell: EmptyCell,

          lifecycleCell: VanLifecycleCell,

          startTimeCell: ({ value }: { value: string }) => <StartTimeCell value={value} />,

          endTimeCell: ({ value }: { value: string }) => <EndTimeCell value={value} />,

          actions: ({ data }: { data: VanResponse }) => (
            <VanActions data={data} onDelete={handleVanDelete} onEvict={handleVanEvict} />
          )
        }}
        emptyStateMessage={labels.emptyStates.noVansFound}
        emptyStateDescription={labels.descriptions.vans}
      />

      <ModalWrapper
        title={labels.buttons.createVansTitle}
        isOpen={isVanOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseVanModal}
        showFooter={true}
      >
        <VanForm onSubmit={handleVanRefresh} onCancel={handleCloseVanModal} />
      </ModalWrapper>
    </>
  );
};

export default VanList;
