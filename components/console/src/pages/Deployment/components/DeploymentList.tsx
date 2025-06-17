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
import { DeploymentResponse } from '../../../API/REST.interfaces';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import LinkCell, { LinkCellProps } from '../../../core/components/LinkCell';
import { ModalWrapper } from '../../../core/components/ModalWrapper';
import SkTable from '../../../core/components/SkTable';
import { useModal } from '../../../core/hooks/useModal';
import { deploymentColumns } from '../Deployments.constants';
import { EmptyCell, AppLinkCell, DateCell, LifecycleCell, DeploymentActions } from './DeploymentCells';
import DeploymentForm from './DeploymentForm';
import { useDeploymentOperations } from '../hooks/useDeploymentOperations';
import labels from '../../../core/config/labels';

/**
 * DeploymentList component handles the list view of all deployments
 * Uses SkTable format similar to LibraryList
 */
const DeploymentList = function () {
  // Modal state management
  const { isOpen: isDeploymentOpen, openModal: handleOpenModal, closeModal: handleCloseModal } = useModal();

  // Data operations
  const {
    deployments,
    error: deploymentError,
    deleteDeployment: handleDeleteDeployment,
    refreshDeployments,
    clearError
  } = useDeploymentOperations();

  const handleDeploymentRefresh = useCallback(() => {
    refreshDeployments();
    handleCloseModal();
  }, [refreshDeployments, handleCloseModal]);

  const handleDeleteAndRefresh = useCallback(
    (id: string) => {
      handleDeleteDeployment(id);
      refreshDeployments();
    },
    [handleDeleteDeployment, refreshDeployments]
  );

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <CreateButton onClick={handleOpenModal}>{labels.buttons.createDeploymentTitle}</CreateButton>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {deploymentError && (
        <Alert
          variant="danger"
          title={deploymentError}
          isInline
          timeout={ALERT_VISIBILITY_TIMEOUT}
          actionClose={<AlertActionCloseButton onClose={clearError} />}
        />
      )}

      <SkTable
        columns={deploymentColumns}
        rows={deployments}
        paginationPageSize={DEFAULT_PAGINATION_SIZE}
        pagination={true}
        customCells={{
          linkCell: (props: LinkCellProps<DeploymentResponse>) =>
            LinkCell({
              ...props,
              type: 'deployment'
            }),

          emptyCell: EmptyCell,

          appLinkCell: AppLinkCell,

          lifecycleCell: LifecycleCell,

          dateCell: DateCell,

          actions: ({ data }: { data: DeploymentResponse }) => (
            <DeploymentActions data={data} onDelete={handleDeleteAndRefresh} />
          )
        }}
        emptyStateMessage={labels.errors.noDeploymentsFound}
        emptyStateDescription={labels.errors.noDeploymentsDescription}
      />

      <ModalWrapper
        title={labels.buttons.createDeploymentTitle}
        isOpen={isDeploymentOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseModal}
        showFooter={true}
      >
        <DeploymentForm onSubmit={handleDeploymentRefresh} onCancel={handleCloseModal} />
      </ModalWrapper>
    </>
  );
};

export default DeploymentList;
