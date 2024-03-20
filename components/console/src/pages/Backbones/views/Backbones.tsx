import { KeyboardEvent, MouseEvent as ReactMouseEvent, useCallback, useState } from 'react';

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
  Tabs,
  Tab,
  TabTitleText,
  Text,
  TextContent,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Title
} from '@patternfly/react-core';
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

import Vans from './Vans';
import { backboneColumns } from '../Backbones.constants';
import { BackboneLabels, RoutesPaths, QueriesBackbones } from '../Backbones.enum';
import BackboneForm from '../Components/BackboneForm';

const Backbones = function () {
  const [isOpen, setOpen] = useState(false);
  const [validated, setValidated] = useState<string | undefined>();
  const [activeTabKey, setActiveTabKey] = useState<string | number>(0);

  const { data: backbones, refetch } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetBackbones],
    queryFn: () => RESTApi.fetchBackbones()
  });

  const handleTabClick = (_: ReactMouseEvent | KeyboardEvent | MouseEvent, tabIndex: string | number) => {
    setActiveTabKey(tabIndex);
  };

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
        <Tabs activeKey={activeTabKey} onSelect={handleTabClick} isBox>
          <Tab eventKey={0} title={<TabTitleText>{BackboneLabels.ApplicationNetworks}</TabTitleText>}>
            <Vans />
          </Tab>

          <Tab eventKey={1} title={<TabTitleText>{BackboneLabels.Backbones}</TabTitleText>}>
            {validated && <Alert variant="danger" title={validated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}

            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Title headingLevel="h2">{BackboneLabels.Backbones}</Title>
                </ToolbarItem>
                <ToolbarGroup align={{ default: 'alignRight' }}>
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
          </Tab>
        </Tabs>
      }
    />
  );
};

export default Backbones;
