import { FC } from 'react';

import {
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Badge,
  Button,
  Alert,
  AlertActionCloseButton,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Flex
} from '@patternfly/react-core';
import { TrashIcon, UsersIcon } from '@patternfly/react-icons';

import EmptyData from '../../../core/components/EmptyData';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import { useVanDetails } from '../hooks/useVanDetails';
import { useVanSiteOperations } from '../hooks/useVanSiteOperations';
import labels from '../../../core/config/labels';
import { hexColors } from '../../../config/colors';
import { MemberLifeCycleStatus } from '../../../API/REST.interfaces';

interface VanMembersProps {
  vanId: string;
}

const VanMembers: FC<VanMembersProps> = function ({ vanId }) {
  const { van } = useVanDetails(vanId);
  const { vanSites: memberSites, error: siteError, evictMember, clearError, isEvicting } = useVanSiteOperations(vanId);

  const getStatusVariant = (lifecycle: MemberLifeCycleStatus) => {
    switch (lifecycle) {
      case 'ready':
        return hexColors.Green500;
      case 'active':
        return hexColors.Green500;
      case 'partial':
        return hexColors.Orange400;
      case 'new':
        return hexColors.Blue400;
      case 'expired':
        return hexColors.Orange700;
      case 'failed':
        return hexColors.Red600;
      default: {
        // @ts-exhaustive-check
        throw new Error(`Unexpected lifecycle value: ${lifecycle}`);
      }
    }
  };

  const getStatusLabel = (lifecycle: MemberLifeCycleStatus) => {
    switch (lifecycle) {
      case 'ready':
        return labels.status.active;
      case 'active':
        return labels.status.active;
      case 'partial':
        return labels.status.pending;
      case 'new':
        return labels.status.new;
      case 'expired':
        return labels.status.expired;
      case 'failed':
        return labels.status.failed;
      default: {
        // @ts-exhaustive-check
        throw new Error(`Unexpected lifecycle value: ${lifecycle}`);
      }
    }
  };

  const handleEvictMember = (siteId: string) => {
    evictMember(siteId);
  };

  return (
    <>
      <Toolbar className="pf-u-mb-md">
        <ToolbarContent>
          <ToolbarItem>
            <Flex direction={{ default: 'column' }}>
              <Title headingLevel="h2" size="lg">
                {labels.navigation.members}
              </Title>
              {labels.descriptions.members}
            </Flex>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {siteError && (
        <Alert
          variant="danger"
          title={siteError}
          isInline
          actionClose={<AlertActionCloseButton onClose={clearError} />}
        />
      )}

      <DataList aria-label="VAN members list">
        {memberSites.map((member) => (
          <DataListItem key={member.id} aria-labelledby={`member-${member.id}`}>
            <DataListItemRow>
              <DataListItemCells
                dataListCells={[
                  <DataListCell key="name" width={3}>
                    <div id={`member-${member.id}`}>
                      <strong>{member.name}</strong>
                      {member.invitationname && (
                        <div className="sk-text-secondary">
                          {labels.generic.viaInvitation} {member.invitationname}
                        </div>
                      )}
                    </div>
                  </DataListCell>,
                  <DataListCell key="status" width={2}>
                    <Badge color={getStatusVariant(member.lifecycle)}>{getStatusLabel(member.lifecycle)}</Badge>
                    {member.failure && <div className="sk-text-error">{member.failure}</div>}
                  </DataListCell>,
                  <DataListCell key="heartbeat" width={2}>
                    <div>
                      <strong>{labels.generic.lastHeartbeat}:</strong>
                      <div className="sk-text-small">
                        <LocaleDateTimeCell
                          value={member.lastheartbeat}
                          placeholder={labels.generic.never}
                          compact={true}
                          showRelative={true}
                        />
                      </div>
                    </div>
                  </DataListCell>,
                  <DataListCell key="firstActive" width={2}>
                    <div>
                      <strong>{labels.generic.firstActive}:</strong>
                      <div className="sk-text-small">
                        <LocaleDateTimeCell
                          value={member.firstactivetime}
                          placeholder={labels.generic.notActive}
                          compact={true}
                        />
                      </div>
                    </div>
                  </DataListCell>,
                  <DataListCell key="actions" width={1}>
                    <Button
                      variant="link"
                      icon={<TrashIcon />}
                      onClick={() => handleEvictMember(member.id)}
                      isDanger
                      size="sm"
                      isLoading={isEvicting}
                      isDisabled={isEvicting}
                    >
                      {isEvicting ? labels.generic.evicting : labels.generic.evict}
                    </Button>
                  </DataListCell>
                ]}
              />
            </DataListItemRow>
          </DataListItem>
        ))}
      </DataList>

      {memberSites.length === 0 && (
        <EmptyData
          icon={UsersIcon}
          message={`${labels.errors.noMembersFound} ${van?.name || vanId}`}
          description={labels.errors.noMembersDescription}
        />
      )}
    </>
  );
};

export default VanMembers;
