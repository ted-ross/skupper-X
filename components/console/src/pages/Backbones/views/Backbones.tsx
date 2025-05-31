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
import {
	Modal,
	ModalVariant
} from '@patternfly/react-core/deprecated';
import { CheckCircleIcon, InProgressIcon, SyncAltIcon } from '@patternfly/react-icons';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';
import { VarColors } from '@config/colors';
import { ALERT_VISIBILITY_TIMEOUT, BIG_PAGINATION_SIZE } from '@config/config';
import LinkCell from '@core/components/LinkCell';
import { LinkCellProps } from '@core/components/LinkCell/LinkCell.interfaces';
import SkTable from '@core/components/SkTable';
import MainContainer from '@layout/MainContainer';
import { BackboneResponse, HTTPError } from 'API/REST.interfaces';

import { backboneColumns } from '../Backbones.constants';
import { BackboneLabels, RoutesPaths, QueriesBackbones } from '../Backbones.enum';
import BackboneForm from '../Components/BackboneForm';

const Backbones = function () {
  const [isOpen, setOpen] = useState(false);
  const [validated, setValidated] = useState<string | undefined>();

  const { data: backbones, refetch } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetBackbones],
    queryFn: () => RESTApi.fetchBackbones()
  });

  const mutationActivate = useMutation({
    mutationFn: (id: string) => RESTApi.activateBackbone(id),
    onSuccess: () => {
      setTimeout(() => {
        refetch();
      }, 0);
    }
  });

  const mutationDelete = useMutation({
    mutationFn: (id: string) => RESTApi.deleteBackbone(id),
    onError: (data: HTTPError) => {
      setValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      setTimeout(() => {
        refetch();
      }, 0);
    }
  });

  const handleOpenModal = useCallback(() => {
    setOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setOpen(false);
  }, []);

  const handleActivate = useCallback(
    (id: string) => {
      mutationActivate.mutate(id);
    },
    [mutationActivate]
  );

  const handleDelete = useCallback(
    (id: string) => {
      mutationDelete.mutate(id);
    },
    [mutationDelete]
  );

  const handleRefresh = useCallback(() => {
    setTimeout(() => {
      refetch();
    }, 0);

    handleCloseModal();
  }, [refetch, handleCloseModal]);

  return (
    <MainContainer
      title={BackboneLabels.Section}
      description={BackboneLabels.Description}
      mainContentChildren={
        <>
          {validated && <Alert variant="danger" title={validated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}

          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup align={{ default: "alignEnd" }}>
                <ToolbarItem>
                  <Button onClick={handleOpenModal}>{BackboneLabels.CreateBackboneTitle}</Button>
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>

          <SkTable
            columns={backboneColumns}
            rows={backbones}
            paginationPageSize={BIG_PAGINATION_SIZE}
            customCells={{
              lifecycleCell: (props: LinkCellProps<BackboneResponse>) => (
                <div>
                  <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                    {props.data.lifecycle === 'ready' ? (
                      <SyncAltIcon color={VarColors.Blue400} />
                    ) : (
                      <InProgressIcon color={VarColors.Black400} />
                    )}
                  </Icon>{' '}
                  {props.data.lifecycle}
                </div>
              ),
              booleanCell: (props: LinkCellProps<BackboneResponse>) =>
                props.data.multitenant === true ? (
                  <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                    <CheckCircleIcon color={VarColors.Green500} />
                  </Icon>
                ) : (
                  ''
                ),
              linkCell: (props: LinkCellProps<BackboneResponse>) =>
                LinkCell({
                  ...props,
                  type: 'backbone',
                  link: `${RoutesPaths.App}/sites/${props.data.name}@${props.data.id}`
                }),
              actions: ({ data }: { data: BackboneResponse }) => (
                <OverflowMenu breakpoint="lg">
                  <OverflowMenuContent>
                    <OverflowMenuGroup groupType="button">
                      <OverflowMenuItem>
                        <Button onClick={() => handleActivate(data.id)} isDisabled={data.lifecycle === 'ready'}>
                          {BackboneLabels.ActivateBackboneBtn}
                        </Button>
                      </OverflowMenuItem>
                      <OverflowMenuItem>
                        <Button onClick={() => handleDelete(data.id)} variant="secondary">
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
            title={BackboneLabels.CreateBackboneTitle}
            isOpen={!!isOpen}
            variant={ModalVariant.medium}
            onClose={handleCloseModal}
          >
            <BackboneForm onSubmit={handleRefresh} onCancel={handleCloseModal} />
          </Modal>
        </>
      }
    />
  );
};

export default Backbones;
