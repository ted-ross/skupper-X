import { FC, useCallback, useState } from 'react';

import {
	Alert,
	Button,
	Icon,
	OverflowMenu,
	OverflowMenuContent,
	OverflowMenuGroup,
	OverflowMenuItem,
	PageSection,
	Stack,
	StackItem,
	Timestamp,
	TimestampFormat,
	Title,
	Toolbar,
	ToolbarContent,
	ToolbarGroup,
	ToolbarItem,
} from '@patternfly/react-core';
import {
	Modal,
	ModalVariant
} from '@patternfly/react-core/deprecated';
import { InProgressIcon, SyncAltIcon } from '@patternfly/react-icons';
import { useMutation, useSuspenseQueries } from '@tanstack/react-query';
import { useParams } from 'react-router';

import { RESTApi } from '@API/REST.api';
import { HTTPError, InvitationResponse, MemberResponse } from '@API/REST.interfaces';
import { VarColors } from '@config/colors';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '@config/config';
import { LinkCellProps } from '@core/components/LinkCell/LinkCell.interfaces';
import SkTable from '@core/components/SkTable';
import { getIdAndNameFromUrlParams } from '@core/utils/getIdAndNameFromUrlParams';
import MainContainer from '@layout/MainContainer';

import { invitationColumns, memberColumns } from '../Backbones.constants';
import { BackboneLabels, InvitationLabels, QueriesBackbones } from '../Backbones.enum';
import InvitationForm from '../Components/InvitationForm';
import InvitationYamlForm from '../Components/InvitationYamlForm';

const InvitationContainer = function () {
  const { vid: urlId } = useParams() as { vid: string };
  const { id: vid } = getIdAndNameFromUrlParams(urlId);

  return (
    <MainContainer
      title={InvitationLabels.Section}
      mainContentChildren={
        <PageSection hasBodyWrapper={false}>
          <Invitations vid={vid} />
        </PageSection>
      }
    />
  );
};

const Invitations: FC<{ vid: string }> = function ({ vid }) {
  const [validated, setValidated] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  const [iidSelected, setIidSelected] = useState<string | undefined>();

  const [
    { data: van },
    { data: invitations, refetch: refetchInvitations },
    { data: members, refetch: refetchMembers }
  ] = useSuspenseQueries({
    queries: [
      {
        queryKey: [QueriesBackbones.GetVan, vid],
        queryFn: () => RESTApi.searchVan(vid)
      },
      {
        queryKey: [QueriesBackbones.GetInvitations, vid],
        queryFn: () => RESTApi.fetchInvitations(vid)
      },
      {
        queryKey: [QueriesBackbones.GetMembers, vid],
        queryFn: () => RESTApi.fetchMembers(vid)
      }
    ]
  });

  const mutationDelete = useMutation({
    mutationFn: (iid: string) => RESTApi.deleteInvitation(iid),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      setTimeout(() => {
        refetchInvitations();
      }, 0);
    }
  });

  const handleCloseModal = useCallback(() => {
    setIsOpen(false);
    setIidSelected(undefined);
  }, []);

  const handleOpenModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setTimeout(() => {
      refetchInvitations();
      refetchMembers();
      handleCloseModal();
    }, 0);
  }, [handleCloseModal, refetchInvitations, refetchMembers]);

  const handleGetInvitationYaml = useCallback((iid: string) => {
    setIidSelected(iid);
  }, []);

  const handleInvitationDelete = useCallback(
    (iid: string) => {
      mutationDelete.mutate(iid);
    },
    [mutationDelete]
  );

  return (
    <Stack hasGutter>
      <StackItem>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Title headingLevel="h2">{BackboneLabels.Invitations}</Title>
            </ToolbarItem>
            <ToolbarGroup align={{ default: "alignEnd" }}>
              <ToolbarItem>
                <Button onClick={handleOpenModal}>{InvitationLabels.CreateTitle}</Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>

        {validated && <Alert variant="danger" title={validated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}
        <SkTable
          columns={invitationColumns}
          rows={invitations}
          paginationPageSize={DEFAULT_PAGINATION_SIZE}
          pagination={true}
          customCells={{
            emptyCell: (props: LinkCellProps<InvitationResponse>) => props.value || '-',

            lifecycleCell: (props: LinkCellProps<InvitationResponse>) => (
              <span>
                <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                  {props.data.lifecycle === 'ready' ? (
                    <SyncAltIcon color={VarColors.Blue400} />
                  ) : (
                    <InProgressIcon color={VarColors.Black400} />
                  )}
                </Icon>{' '}
                {props.data.lifecycle}
              </span>
            ),

            actions: ({ data }: { data: InvitationResponse }) => (
              <OverflowMenu breakpoint="lg">
                <OverflowMenuContent>
                  <OverflowMenuGroup groupType="button">
                    <OverflowMenuItem>
                      <Button onClick={() => handleGetInvitationYaml(data.id)}>
                        {InvitationLabels.GetInvitationYAMLTitle}
                      </Button>
                    </OverflowMenuItem>
                    <OverflowMenuItem>
                      <Button onClick={() => handleInvitationDelete(data.id)} variant="secondary">
                        {BackboneLabels.DeleteBackboneBtn}
                      </Button>
                    </OverflowMenuItem>
                  </OverflowMenuGroup>
                </OverflowMenuContent>
              </OverflowMenu>
            )
          }}
        />
      </StackItem>

      <StackItem>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Title headingLevel="h2">{BackboneLabels.Members}</Title>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {validated && <Alert variant="danger" title={validated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}
        <SkTable
          columns={memberColumns}
          rows={members}
          paginationPageSize={DEFAULT_PAGINATION_SIZE}
          pagination={true}
          customCells={{
            DateCell: (props: LinkCellProps<MemberResponse>) => (
              <Timestamp
                date={new Date(props.value || '')}
                dateFormat={TimestampFormat.medium}
                timeFormat={TimestampFormat.medium}
              />
            ),
            emptyCell: (props: LinkCellProps<MemberResponse>) => props.value || '-',

            lifecycleCell: (props: LinkCellProps<MemberResponse>) => (
              <span>
                <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                  {props.data.lifecycle === 'ready' ? (
                    <SyncAltIcon color={VarColors.Blue400} />
                  ) : (
                    <InProgressIcon color={VarColors.Black400} />
                  )}
                </Icon>{' '}
                {props.data.lifecycle}
              </span>
            )
          }}
        />
      </StackItem>

      <Modal
        title={InvitationLabels.CreateTitle}
        isOpen={isOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseModal}
      >
        <InvitationForm bid={van.backbone} vid={vid} onSubmit={handleRefresh} onCancel={handleCloseModal} />
      </Modal>

      <Modal
        title={InvitationLabels.GetInvitationYAMLTitle}
        isOpen={iidSelected !== undefined}
        variant={ModalVariant.medium}
        onClose={handleCloseModal}
        actions={[
          <Button variant="primary" onClick={handleRefresh} key={`${BackboneLabels.DoneBtn}`}>
            {BackboneLabels.DoneBtn}
          </Button>,
          <Button variant="link" onClick={handleCloseModal} key={`${BackboneLabels.CancelBackboneBtn}`}>
            {BackboneLabels.CancelBackboneBtn}
          </Button>
        ]}
      >
        {iidSelected && <InvitationYamlForm iid={iidSelected} />}
      </Modal>
    </Stack>
  );
};

export default InvitationContainer;
