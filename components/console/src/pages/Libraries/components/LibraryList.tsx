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
import { LibraryBlockResponse } from '../../../API/REST.interfaces';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import LinkCell, { LinkCellProps } from '../../../core/components/LinkCell';
import { ModalWrapper } from '../../../core/components/ModalWrapper';
import SkTable from '../../../core/components/SkTable';
import { useModal } from '../../../core/hooks/useModal';
import { libraryColumns } from '../Libraries.constants';
import { LibraryPaths } from '../Libraries.constants';
import { EmptyCell, TypeCell, DateCell, LibraryActions } from './LibraryCells';
import LibraryForm from './LibraryForm';
import { useLibraryOperations } from '../hooks/useLibraryOperations';
import labels from '../../../core/config/labels';

/**
 * LibraryList component handles the list view of all libraries
 * Uses SkTable format similar to BackboneList
 */
const LibraryList = function () {
  // Modal state management
  const { isOpen: isLibraryOpen, openModal: handleOpenModal, closeModal: handleCloseModal } = useModal();

  // Data operations
  const {
    libraries,
    error: libraryError,
    deleteLibrary: handleDeleteLibrary,
    refreshLibraries,
    clearError
  } = useLibraryOperations();

  const handleLibraryRefresh = useCallback(() => {
    refreshLibraries();
    handleCloseModal();
  }, [refreshLibraries, handleCloseModal]);

  const handleDeleteAndRefresh = useCallback(
    (id: string) => {
      handleDeleteLibrary(id);
      refreshLibraries();
    },
    [handleDeleteLibrary, refreshLibraries]
  );

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <CreateButton onClick={handleOpenModal}>{labels.buttons.createLibraryTitle}</CreateButton>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {libraryError && (
        <Alert
          variant="danger"
          title={libraryError}
          isInline
          timeout={ALERT_VISIBILITY_TIMEOUT}
          actionClose={<AlertActionCloseButton onClose={clearError} />}
        />
      )}

      <SkTable
        columns={libraryColumns}
        rows={libraries}
        paginationPageSize={DEFAULT_PAGINATION_SIZE}
        pagination={true}
        customCells={{
          linkCell: (props: LinkCellProps<LibraryBlockResponse>) =>
            LinkCell({
              ...props,
              type: 'library',
              link: `${LibraryPaths.path}/${props.data.name}@${props.data.id}`
            }),

          emptyCell: EmptyCell,

          typeCell: TypeCell,

          dateCell: DateCell,

          actions: ({ data }: { data: LibraryBlockResponse }) => (
            <LibraryActions data={data} onDelete={handleDeleteAndRefresh} />
          )
        }}
        emptyStateMessage={labels.errors.noLibrariesFound}
        emptyStateDescription={labels.errors.noLibrariesDescription}
      />

      <ModalWrapper
        title={labels.buttons.createLibraryTitle}
        isOpen={isLibraryOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseModal}
        showFooter={true}
      >
        <LibraryForm onSubmit={handleLibraryRefresh} onCancel={handleCloseModal} />
      </ModalWrapper>
    </>
  );
};

export default LibraryList;
