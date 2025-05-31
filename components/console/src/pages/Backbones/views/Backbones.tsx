import React, { useState, useEffect } from 'react';

import {
  PageSection,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Alert,
  AlertActionCloseButton,
  OverflowMenu,
  OverflowMenuContent,
  OverflowMenuGroup,
  OverflowMenuItem
} from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import { PlusIcon, TrashIcon } from '@patternfly/react-icons';
import { SyncAltIcon, InProgressIcon, UsersIcon } from '@patternfly/react-icons';
import { hexColors } from '../../../config/colors';

import { RESTApi } from '../../../API/REST.api';
import { BackboneResponse } from '../../../API/REST.interfaces';
import { DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import LinkCell from '../../../core/components/LinkCell';
import { LinkCellProps } from '../../../core/components/LinkCell/LinkCell.interfaces';
import SkTable from '../../../core/components/SkTable';
import MainContainer from '../../../layout/MainContainer';
import { backboneColumns } from '../Backbones.constants';
import { BackboneLabels, RoutesPaths } from '../Backbones.enum';
import BackboneForm from '../Components/BackboneForm';

const Backbones: React.FC = function () {
  const [backbones, setBackbones] = useState<BackboneResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch backbones on component mount
  useEffect(() => {
    fetchBackbones();
  }, []);

  const fetchBackbones = async () => {
    try {
      setError(null);
      const data = await RESTApi.fetchBackbones();
      setBackbones(data);
    } catch (err: any) {
      console.error('Error fetching backbones:', err);
      setError('Failed to fetch backbones. Please try again.');
    }
  };

  const handleCreateBackbone = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSubmitBackbone = async () => {
    // Refresh the list after creation and close modal
    await fetchBackbones();
    setIsModalOpen(false);
  };

  const handleDeleteBackbone = async (backboneId: string) => {
    try {
      setDeleteError(null);
      await RESTApi.deleteBackbone(backboneId);
      console.log('Deleted backbone with ID:', backboneId);

      // Refresh the list after deletion
      await fetchBackbones();
    } catch (err: any) {
      console.error('Error deleting backbone:', err);
      setDeleteError('Failed to delete backbone. Please try again.');
    }
  };

  // Custom cells for SkTable
  const customCells = {
    linkCell: (props: LinkCellProps<BackboneResponse>) => (
      <LinkCell
        data={props.data}
        value={props.value}
        link={`${RoutesPaths.App}/sites/${props.data.name}@${props.data.id}`}
        type="backbone"
      />
    ),

    lifecycleCell: (props: LinkCellProps<BackboneResponse>) => {
      // Use icon and color for lifecycle state
      const { lifecycle } = props.data;
      let icon = null;
      let color = '';
      switch (lifecycle) {
        case 'ready':
          icon = <SyncAltIcon color={hexColors.Blue400} />;
          color = hexColors.Blue400;
          break;
        case 'partial':
          icon = <InProgressIcon color={hexColors.Orange400} />;
          color = hexColors.Orange400;
          break;
        case 'new':
          icon = <InProgressIcon color={hexColors.Black300} />;
          color = hexColors.Black300;
          break;
        default:
          icon = <InProgressIcon color={hexColors.Black300} />;
          color = hexColors.Black300;
      }
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
          {icon}
          <span>{lifecycle}</span>
        </span>
      );
    },

    booleanCell: (props: LinkCellProps<BackboneResponse>) => {
      // Show icon for multitenant true, muted for false
      const isMulti = props.data.multitenant;
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <UsersIcon
            color={isMulti ? hexColors.Green500 : hexColors.Black300}
            aria-label={isMulti ? 'Multitenant enabled' : 'Multitenant disabled'}
          />
          <span style={{ color: isMulti ? hexColors.Green500 : hexColors.Black300 }}>{isMulti ? 'Yes' : 'No'}</span>
        </span>
      );
    },

    actions: ({ data }: { data: BackboneResponse }) => (
      <OverflowMenu breakpoint="lg">
        <OverflowMenuContent>
          <OverflowMenuGroup groupType="button">
            <OverflowMenuItem>
              <Button variant="link" onClick={() => handleDeleteBackbone(data.id)} icon={<TrashIcon />} isDanger>
                Delete
              </Button>
            </OverflowMenuItem>
          </OverflowMenuGroup>
        </OverflowMenuContent>
      </OverflowMenu>
    )
  };

  return (
    <MainContainer
      title="Backbones"
      description="Manage your backbone networks and infrastructure"
      mainContentChildren={
        <>
          <PageSection>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Button variant="primary" icon={<PlusIcon />} onClick={handleCreateBackbone}>
                    Create Backbone
                  </Button>
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          </PageSection>

          {error && (
            <PageSection>
              <Alert
                variant="danger"
                title="Error"
                isInline
                actionClose={<AlertActionCloseButton onClose={() => setError(null)} />}
              >
                {error}
              </Alert>
            </PageSection>
          )}

          {deleteError && (
            <PageSection>
              <Alert
                variant="danger"
                title="Delete Error"
                isInline
                actionClose={<AlertActionCloseButton onClose={() => setDeleteError(null)} />}
              >
                {deleteError}
              </Alert>
            </PageSection>
          )}

          <PageSection>
            <SkTable
              columns={backboneColumns}
              rows={backbones}
              paginationPageSize={DEFAULT_PAGINATION_SIZE}
              pagination={true}
              customCells={customCells}
              emptyStateMessage="No Backbones found"
              emptyStateDescription="No backbone connections are currently configured. Create a new backbone to connect your Skupper network across clusters."
            />
          </PageSection>

          <Modal
            title={BackboneLabels.CreateBackboneTitle}
            isOpen={isModalOpen}
            variant={ModalVariant.medium}
            onClose={handleCloseModal}
          >
            <BackboneForm onSubmit={handleSubmitBackbone} onCancel={handleCloseModal} />
          </Modal>
        </>
      }
    />
  );
};

export default Backbones;
