import { useCallback, useState } from 'react';

import {
  Alert,
  Button,
  Icon,
  Modal,
  ModalVariant,
  OverflowMenu,
  OverflowMenuContent,
  OverflowMenuGroup,
  OverflowMenuItem,
  Stack,
  StackItem,
  Text,
  TextContent,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import { InProgressIcon, SyncAltIcon } from '@patternfly/react-icons';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { HTTPError, VanResponse } from '@API/REST.interfaces';
import { VarColors } from '@config/colors';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '@config/config';
import LinkCell from '@core/components/LinkCell';
import { LinkCellProps } from '@core/components/LinkCell/LinkCell.interfaces';
import SkTable from '@core/components/SkTable';

import { VanColumns } from '../Backbones.constants';
import { BackboneLabels, RoutesPaths, QueriesBackbones, VanLabels } from '../Backbones.enum';
import VanForm from '../Components/VanForm';

const Vans = function () {
  const [vanValidated, setVanValidated] = useState<string | undefined>();
  const [isVanOpen, setIsVanOpen] = useState(false);

  const { data: vans, refetch: refetchVans } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetVans],
    queryFn: () => RESTApi.fetchVans()
  });

  const mutationDeleteSite = useMutation({
    mutationFn: (vin: string) => RESTApi.deleteVan(vin),
    onError: (data: HTTPError) => {
      setVanValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      setTimeout(() => {
        refetchVans();
      }, 0);
    }
  });

  const handleCloseVanModal = useCallback(() => {
    setIsVanOpen(false);
  }, []);

  const handleOpenVanModal = useCallback(() => {
    setIsVanOpen(true);
  }, []);

  const handleVanRefresh = useCallback(() => {
    setTimeout(() => {
      refetchVans();
      handleCloseVanModal();
    }, 0);
  }, [handleCloseVanModal, refetchVans]);

  const handleVanDelete = useCallback(
    (vid: string) => {
      mutationDeleteSite.mutate(vid);
    },
    [mutationDeleteSite]
  );

  return (
    <Stack hasGutter>
      <StackItem>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Title headingLevel="h2">{BackboneLabels.Vans}</Title>
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignRight' }}>
              <ToolbarItem>
                <Button onClick={handleOpenVanModal}>{VanLabels.CreateVanTitle}</Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>

        {vanValidated && <Alert variant="danger" title={vanValidated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}
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
                link: `${RoutesPaths.App}/invitations/${props.data.name}@${props.data.id}`
              }),

            emptyCell: (props: LinkCellProps<VanResponse>) => props.value || '-',

            lifecycleCell: (props: LinkCellProps<VanResponse>) => (
              <TextContent>
                <Text component="p">
                  <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                    {props.data.lifecycle === 'ready' ? (
                      <SyncAltIcon color={VarColors.Blue400} />
                    ) : (
                      <InProgressIcon color={VarColors.Black400} />
                    )}
                  </Icon>{' '}
                  {props.data.lifecycle}
                </Text>
              </TextContent>
            ),

            deleteDelayCell: (props: LinkCellProps<VanResponse>) =>
              props.value && Object.keys(props.data).length ? props.data.deletedelay.minutes : '-',

            actions: ({ data }: { data: VanResponse }) => (
              <OverflowMenu breakpoint="lg">
                <OverflowMenuContent>
                  <OverflowMenuGroup groupType="button">
                    <OverflowMenuItem>
                      <Button onClick={() => handleVanDelete(data.id)} variant="secondary">
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

      <Modal
        title={VanLabels.CreateVanTitle}
        isOpen={isVanOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseVanModal}
      >
        <VanForm onSubmit={handleVanRefresh} onCancel={handleCloseVanModal} />
      </Modal>
    </Stack>
  );
};

export default Vans;
