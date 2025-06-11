import { useCallback } from 'react';

import { Alert, ModalVariant, Toolbar, ToolbarContent, ToolbarItem } from '@patternfly/react-core';

import { CreateButton } from '../../../core/components/ActionButtons';
import { BackboneResponse } from '../../../API/REST.interfaces';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import LinkCell, { LinkCellProps } from '../../../core/components/LinkCell';
import { ModalWrapper } from '../../../core/components/ModalWrapper';
import SkTable from '../../../core/components/SkTable';
import { useModal } from '../../../core/hooks/useModal';
import { backboneColumns } from '../Backbones.constants';
import { RoutesPaths } from '../Backbones.enum';
import { BackboneLifecycleCell, MultitenantCell, BackboneActions, FailureCell } from './BackboneCells';
import BackboneForm from './BackboneForm';
import { useBackboneOperations } from '../hooks/useBackboneOperations';
import labels from '../../../core/config/labels';

/**
 * BackboneList component handles the list view of all backbones
 * Manages its own state for modals and data operations
 */
const BackboneList = function () {
  // Modal state management
  const { isOpen: isBackboneOpen, openModal: openBackboneModal, closeModal: handleCloseBackboneModal } = useModal();

  const handleOpenBackboneModal = useCallback(() => {
    openBackboneModal();
  }, [openBackboneModal]);

  // Data operations
  const {
    backbones,
    error: backboneError,
    deleteBackbone: handleBackboneDelete,
    activateBackbone: handleBackboneActivate,
    refreshBackbones,
    isActivating
  } = useBackboneOperations();

  const handleBackboneRefresh = useCallback(() => {
    // Close modal first for immediate visual feedback
    handleCloseBackboneModal();

    // Refresh data with optimized timing to avoid glitches
    setTimeout(() => {
      refreshBackbones();
    }, 200);
  }, [refreshBackbones, handleCloseBackboneModal]);

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <CreateButton onClick={handleOpenBackboneModal}>{labels.buttons.createBackboneTitle}</CreateButton>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {backboneError && <Alert variant="danger" title={backboneError} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}

      <SkTable
        columns={backboneColumns}
        rows={backbones}
        paginationPageSize={DEFAULT_PAGINATION_SIZE}
        pagination={true}
        customCells={{
          linkCell: (props: LinkCellProps<BackboneResponse>) =>
            LinkCell({
              ...props,
              type: 'backbone',
              link: `${RoutesPaths.Backbones}/${props.data.name}@${props.data.id}`
            }),

          lifecycleCell: BackboneLifecycleCell,

          booleanCell: MultitenantCell,

          failure: FailureCell,

          actions: ({ data }: { data: BackboneResponse }) => (
            <BackboneActions
              data={data}
              onDelete={handleBackboneDelete}
              onActivate={handleBackboneActivate}
              isActivating={isActivating}
            />
          )
        }}
        emptyStateMessage={labels.emptyStates.noBackbonesFound}
        emptyStateDescription={labels.descriptions.backbones}
      />

      <ModalWrapper
        title={labels.buttons.createBackboneTitle}
        isOpen={isBackboneOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseBackboneModal}
        showFooter={true}
      >
        <BackboneForm onSubmit={handleBackboneRefresh} onCancel={handleCloseBackboneModal} />
      </ModalWrapper>
    </>
  );
};

export default BackboneList;
