import { useCallback, useState } from 'react';

import {
  Alert,
  Button,
  Icon,
  OverflowMenu,
  OverflowMenuContent,
  OverflowMenuGroup,
  OverflowMenuItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import { InProgressIcon, SyncAltIcon } from '@patternfly/react-icons';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { ApplicationNetworkResponse, HTTPError } from '../../../API/REST.interfaces';
import { hexColors } from '../../../config/colors';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import LinkCell from '../../../core/components/LinkCell';
import { LinkCellProps } from '../../../core/components/LinkCell/LinkCell.interfaces';
import SkTable from '../../../core/components/SkTable';
import MainContainer from '../../../layout/MainContainer';
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
    <MainContainer
      title={VanLabels.Section}
      description={VanLabels.Description}
      mainContentChildren={
        <>
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup align={{ default: 'alignEnd' }}>
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
              linkCell: (props: LinkCellProps<ApplicationNetworkResponse>) =>
                LinkCell({
                  ...props,
                  type: 'van',
                  link: `${RoutesPaths.App}/invitations/${props.data.name}@${props.data.id}`
                }),

              emptyCell: (props: LinkCellProps<ApplicationNetworkResponse>) => props.value || '-',

              lifecycleCell: (props: LinkCellProps<ApplicationNetworkResponse>) => (
                <div>
                  <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                    {props.data.lifecycle === 'ready' ? (
                      <SyncAltIcon color={hexColors.Blue400} />
                    ) : (
                      <InProgressIcon color={hexColors.Black300} />
                    )}
                  </Icon>{' '}
                  {props.data.lifecycle}
                </div>
              ),

              deleteDelayCell: (props: LinkCellProps<ApplicationNetworkResponse>) =>
                props.value && Object.keys(props.data).length && props.data.deletedelay ? props.data.deletedelay : '-',

              actions: ({ data }: { data: ApplicationNetworkResponse }) => (
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

          <Modal
            title={VanLabels.CreateVanTitle}
            isOpen={isVanOpen}
            variant={ModalVariant.medium}
            onClose={handleCloseVanModal}
          >
            <VanForm onSubmit={handleVanRefresh} onCancel={handleCloseVanModal} />
          </Modal>
        </>
      }
    />
  );
};

export default Vans;
