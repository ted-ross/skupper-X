import { FC, useEffect, useState } from 'react';

import {
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Badge,
  Flex,
  Button,
  Alert,
  AlertActionCloseButton,
  Split,
  SplitItem,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  EmptyState,
  EmptyStateBody,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import { TrashIcon, TimesIcon, EnvelopeIcon } from '@patternfly/react-icons';

import InvitationForm from './InvitationForm';
import { RESTApi } from '../../../API/REST.api';
import { InvitationResponse } from '../../../API/REST.interfaces';
import { CreateButton } from '../../../core/components/ActionButtons';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import { useVanDetails } from '../hooks/useVanDetails';
import { useVanInvitationOperations } from '../hooks/useVanInvitationOperations';
import labels from '../../../core/config/labels';
import { hexColors } from '../../../config/colors';

interface VanInvitationsProps {
  vanId: string;
}

const VanInvitations: FC<VanInvitationsProps> = function ({ vanId }) {
  const { van: vanDetails } = useVanDetails(vanId);
  const {
    invitations,
    error: invitationError,
    deleteInvitation,
    expireInvitation,
    clearError,
    refreshInvitations,
    isCreating,
    isDeleting,
    isExpiring
  } = useVanInvitationOperations(vanId);

  // --- New logic for fetching access points ---
  const [claimAccessId, setClaimAccessId] = useState<string | undefined>();
  const [memberAccessId, setMemberAccessId] = useState<string | undefined>();
  const [claimAccessReady, setClaimAccessReady] = useState<boolean>(false);
  const [memberAccessReady, setMemberAccessReady] = useState<boolean>(false);
  const [accessLoading, setAccessLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAccessPoints() {
      setAccessLoading(true);
      try {
        // Fetch van details to get backbone id
        const van = await RESTApi.searchVan(vanId);
        const backboneId = van.backboneid;

        // Fetch claim and member access points
        const claimList = await RESTApi.fetchAccessClaims(backboneId);
        const memberList = await RESTApi.fetchAccessMember(backboneId);
        if (!cancelled) {
          const claimId = claimList?.[0]?.id;
          const memberId = memberList?.[0]?.id;

          setClaimAccessId(claimId);
          setMemberAccessId(memberId);
          // API already filters for 'ready' lifecycle, so if we have access points, they are ready
          setClaimAccessReady(!!claimId);
          setMemberAccessReady(!!memberId);
        }
      } catch (e) {
        if (!cancelled) {
          setClaimAccessId(undefined);
          setMemberAccessId(undefined);
          setClaimAccessReady(false);
          setMemberAccessReady(false);
        }
      } finally {
        if (!cancelled) {
          setAccessLoading(false);
        }
      }
    }

    fetchAccessPoints();

    return () => {
      cancelled = true;
    };
  }, [vanId]);

  const getStatusColor = (lifecycle: string) => {
    switch (lifecycle) {
      case 'ready':
        return hexColors.Green500;
      case 'expired':
        return hexColors.Red600;
      case 'partial':
        return hexColors.Orange400;
      default:
        return hexColors.Black300;
    }
  };

  const getStatusText = (lifecycle: string) => {
    switch (lifecycle) {
      case 'ready':
        return labels.status.active;
      case 'expired':
        return labels.status.expired;
      case 'partial':
        return labels.status.pending;
      default:
        return lifecycle;
    }
  };

  const handleCreateInvitation = () => {
    setIsModalOpen(true);
  };

  const handleModalSubmit = () => {
    setIsModalOpen(false);
    // The form will handle the actual invitation creation
  };

  const handleModalCancel = () => {
    setIsModalOpen(false);
  };

  const handleDeleteInvitation = (invitationId: string) => {
    deleteInvitation(invitationId);
  };

  const handleExpireInvitation = (invitationId: string) => {
    expireInvitation(invitationId);
  };

  return (
    <>
      {invitationError && (
        <Alert
          variant="danger"
          title={invitationError}
          isInline
          actionClose={<AlertActionCloseButton onClose={clearError} />}
        />
      )}

      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Flex direction={{ default: 'column' }}>
              <Title headingLevel="h2">{labels.navigation.invitations}</Title>
              {labels.descriptions.invitations}
            </Flex>
          </ToolbarItem>
          <ToolbarGroup align={{ default: 'alignEnd' }}>
            <ToolbarItem>
              <CreateButton
                onClick={handleCreateInvitation}
                isLoading={isCreating || accessLoading}
                disabled={isCreating || accessLoading || !claimAccessId || !memberAccessId}
              >
                {labels.buttons.addInvitation}
              </CreateButton>
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>

      {(!claimAccessId || !memberAccessId || !claimAccessReady || !memberAccessReady) && !accessLoading && (
        <Alert
          variant="warning"
          title={labels.validation.bothAccessPointsRequired}
          isInline
          className="sk-margin-bottom-md"
        >
          {labels.validation.bothAccessPointsRequired}
        </Alert>
      )}

      <DataList aria-label="VAN invitations list">
        {invitations.map((invitation: InvitationResponse) => (
          <DataListItem key={invitation.id} aria-labelledby={`invitation-${invitation.id}`}>
            <DataListItemRow>
              <DataListItemCells
                dataListCells={[
                  <DataListCell key="name" width={3}>
                    <div id={`invitation-${invitation.id}`}>
                      <strong>{invitation.name}</strong>
                      {invitation.memberclasses && invitation.memberclasses.length > 0 && (
                        <div className="sk-text-secondary">
                          {labels.columns.classes} {invitation.memberclasses.join(', ')}
                        </div>
                      )}
                    </div>
                  </DataListCell>,
                  <DataListCell key="status" width={2}>
                    <Badge color={getStatusColor(invitation.lifecycle)}>{getStatusText(invitation.lifecycle)}</Badge>
                    {invitation.failure && <div className="sk-text-error">{invitation.failure}</div>}
                  </DataListCell>,
                  <DataListCell key="limits" width={2}>
                    <div>
                      <strong>{labels.columns.instances}:</strong>
                      <div className="sk-text-small">
                        {invitation.instancecount} / {invitation.instancelimit || labels.forms.unlimited}
                      </div>
                    </div>
                  </DataListCell>,
                  <DataListCell key="fetches" width={2}>
                    <div>
                      <strong>{labels.columns.fetches}:</strong>
                      <div className="sk-text-small">{invitation.fetchcount || 0}</div>
                    </div>
                  </DataListCell>,
                  <DataListCell key="joindeadline" width={2}>
                    <div>
                      <strong>{labels.columns.joinDeadline}:</strong>
                      <div className="sk-text-small">
                        <LocaleDateTimeCell value={invitation.joindeadline} compact={true} />
                      </div>
                    </div>
                  </DataListCell>,
                  <DataListCell key="interactive" width={1}>
                    <div>
                      <strong>{labels.columns.interactive}:</strong>
                      <div className="sk-text-small">
                        {invitation.interactive ? labels.generic.yes : labels.generic.no}
                      </div>
                    </div>
                  </DataListCell>,
                  <DataListCell key="actions" width={1}>
                    <Split hasGutter>
                      {invitation.lifecycle === 'ready' && (
                        <SplitItem>
                          <Button
                            variant="link"
                            icon={<TimesIcon />}
                            onClick={() => handleExpireInvitation(invitation.id)}
                            size="sm"
                            isLoading={isExpiring}
                            isDisabled={isExpiring}
                          >
                            {isExpiring ? labels.generic.evicting : labels.buttons.delete}
                          </Button>
                        </SplitItem>
                      )}
                      <SplitItem>
                        <Button
                          variant="link"
                          icon={<TrashIcon />}
                          onClick={() => handleDeleteInvitation(invitation.id)}
                          isDanger
                          size="sm"
                          isLoading={isDeleting}
                          isDisabled={isDeleting}
                        >
                          {isDeleting ? labels.generic.evicting : labels.buttons.delete}
                        </Button>
                      </SplitItem>
                    </Split>
                  </DataListCell>
                ]}
              />
            </DataListItemRow>
          </DataListItem>
        ))}
      </DataList>

      {invitations.length === 0 && (
        <EmptyState>
          <EnvelopeIcon />
          <Title headingLevel="h4" size="lg">
            {labels.emptyStates.noInvitationsFound} {vanDetails?.name || vanId}
          </Title>
          <EmptyStateBody>{labels.emptyStates.noInvitationsDescription}</EmptyStateBody>
        </EmptyState>
      )}

      <Modal variant={ModalVariant.medium} isOpen={isModalOpen} onClose={handleModalCancel}>
        <ModalHeader title={labels.buttons.addInvitation} />
        <ModalBody>
          <InvitationForm
            vanId={vanId}
            onSubmit={handleModalSubmit}
            onCancel={handleModalCancel}
            onRefresh={refreshInvitations}
          />
        </ModalBody>
      </Modal>
    </>
  );
};

export default VanInvitations;
