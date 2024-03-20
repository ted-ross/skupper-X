import { useCallback, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Divider,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuList,
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
  Timestamp,
  TimestampFormat,
  Title,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import { InProgressIcon, SyncAltIcon, TableIcon, TopologyIcon } from '@patternfly/react-icons';
import { useMutation, useSuspenseQueries } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { RESTApi } from '@API/REST.api';
import { VarColors } from '@config/colors';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '@config/config';
import { getTestsIds } from '@config/testIds';
import { GraphNode, GraphReactAdaptorExposedMethods } from '@core/components/Graph/Graph.interfaces';
import LinkCell from '@core/components/LinkCell';
import { LinkCellProps } from '@core/components/LinkCell/LinkCell.interfaces';
import SkTable from '@core/components/SkTable';
import { getIdAndNameFromUrlParams } from '@core/utils/getIdAndNameFromUrlParams';
import MainContainer from '@layout/MainContainer';
import { HTTPError, LinkResponse, SiteResponse } from 'API/REST.interfaces';

import { DeploymentStatusColorMap, linkColumns, siteColumns } from '../Backbones.constants';
import {
  BackboneLabels,
  RoutesPaths,
  ContextMenuLabels,
  DeploymentStates,
  LinkLabels,
  QueriesBackbones,
  SiteLabels
} from '../Backbones.enum';
import DeployBootstrap from '../Components/DeployBootstrap';
import InitialDeploymentForm from '../Components/InitialDeploymentForm';
import LinkForm from '../Components/LinkForm';
import SiteForm from '../Components/SiteForm';
import Topology from '../Components/Topology';

const Backbone = function () {
  const { id: urlId } = useParams() as { id: string };
  const { id: bid, name: bname } = getIdAndNameFromUrlParams(urlId);

  const graphRef = useRef<GraphReactAdaptorExposedMethods>();

  const sidSelected = useRef<string | undefined>();
  const sitePositionToSave = useRef<{ x: number; y: number }>();

  const [view, setView] = useState<'table' | 'topology'>('table');
  const [sid, setSid] = useState<string>();

  const [isSiteOpen, setSiteOpen] = useState(false);
  const [siteValidated, setSiteValidated] = useState<string | undefined>();

  const [isLinkOpen, setLinkOpen] = useState(false);
  const [linkValidated, setLinkValidated] = useState<string | undefined>();

  const [isEditorOpen, setIsEditorOpen] = useState<'automatic' | 'bootstrap' | boolean>(false);

  const [{ data: sites, refetch: refetchSites }, { data: links, refetch: refetchLinks }] = useSuspenseQueries({
    queries: [
      {
        queryKey: [QueriesBackbones.GetSites, bid],
        queryFn: () => RESTApi.fetchSites(bid)
      },
      {
        queryKey: [QueriesBackbones.GetLinks, bid],
        queryFn: () => RESTApi.fetchLinks(bid)
      }
    ]
  });

  const mutationDeleteSite = useMutation({
    mutationFn: (siteId: string) => RESTApi.deleteSite(siteId),
    onError: (data: HTTPError) => {
      setSiteValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      setTimeout(() => {
        refetchSites();
        refetchLinks();
      }, 0);
    }
  });

  const mutationDeleteLink = useMutation({
    mutationFn: (linkId: string) => RESTApi.deleteLink(linkId),
    onError: (data: HTTPError) => {
      setLinkValidated(data.descriptionMessage);
    },
    onSuccess: () => {
      setTimeout(() => {
        refetchLinks();
      }, 0);
    }
  });

  const handleOpenSiteModal = useCallback(() => {
    setSiteOpen(true);
  }, []);

  const handleCloseSiteModal = useCallback(() => {
    setSiteOpen(false);
    sidSelected.current = undefined;
  }, []);

  const handleOpenLinkModal = useCallback((idSelected?: string) => {
    if (idSelected) {
      sidSelected.current = idSelected;
    }

    setLinkOpen(true);
  }, []);

  const handleCloseLinkModal = useCallback(() => {
    setLinkOpen(false);
  }, []);

  const handleCloseEditorModal = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const handleOpenDetails = useCallback((id: string) => {
    setSid(id);

    if (graphRef.current?.closeContextMenu) {
      graphRef.current?.closeContextMenu();
    }
  }, []);

  const handleGetAutomatic = useCallback((id: string) => {
    sidSelected.current = id;

    setIsEditorOpen('automatic');

    if (graphRef.current?.closeContextMenu) {
      graphRef.current?.closeContextMenu();
    }
  }, []);

  const handleGetBootstrap = useCallback((id: string) => {
    sidSelected.current = id;

    setIsEditorOpen('bootstrap');

    if (graphRef.current?.closeContextMenu) {
      graphRef.current?.closeContextMenu();
    }
  }, []);

  const handleSiteDelete = useCallback(
    (siteId: string) => {
      mutationDeleteSite.mutate(siteId);

      if (graphRef.current?.closeContextMenu) {
        graphRef.current?.closeContextMenu();
      }
    },
    [mutationDeleteSite]
  );

  const handleLinkDelete = useCallback(
    (siteId: string) => {
      mutationDeleteLink.mutate(siteId);

      if (graphRef.current?.closeContextMenu) {
        graphRef.current?.closeContextMenu();
      }
    },
    [mutationDeleteLink]
  );

  const handleRemoveSelected = () => {
    sidSelected.current = undefined;
    setSid(undefined);
  };

  const handleSiteRefresh = useCallback(() => {
    setTimeout(() => {
      refetchSites();
    }, 0);

    handleCloseSiteModal();
  }, [refetchSites, handleCloseSiteModal]);

  const handleLinkRefresh = useCallback(() => {
    setTimeout(() => {
      refetchLinks();
    }, 0);

    handleCloseLinkModal();
  }, [refetchLinks, handleCloseLinkModal]);

  const ContextMenu = function ({ item, target }: { item: GraphNode; target: 'edge' | 'node' | undefined }) {
    const NodeMenu = function () {
      const { id, data } = item;

      return (
        <MenuList>
          <MenuItem itemId={0} onClick={() => handleOpenDetails(id)}>
            {ContextMenuLabels.ViewDetails}
          </MenuItem>
          <MenuItem itemId={1} onClick={() => handleOpenLinkModal?.(id)}>
            {ContextMenuLabels.AddLink}
          </MenuItem>
          <MenuItem itemId={2} onClick={() => handleSiteDelete(id)}>
            {ContextMenuLabels.DeleteSite}
          </MenuItem>
          {data.deploymentstate === DeploymentStates.ReadyAutomatic && (
            <MenuItem itemId={3} onClick={() => handleGetAutomatic(id)}>
              {ContextMenuLabels.GetReadyAutomaticConfig}
            </MenuItem>
          )}
          {data.deploymentstate === DeploymentStates.ReadyBootstrap && (
            <MenuItem itemId={4} onClick={() => handleGetBootstrap(id)}>
              {ContextMenuLabels.GetReadyBootstrapConfig}
            </MenuItem>
          )}
        </MenuList>
      );
    };

    const LinkMenu = function () {
      return (
        <MenuList>
          <MenuItem itemId={1} onClick={() => handleLinkDelete(item.id)}>
            {ContextMenuLabels.DeleteLink}
          </MenuItem>
        </MenuList>
      );
    };

    return (
      <Menu>
        <MenuContent>{target === 'node' ? <NodeMenu /> : <LinkMenu />}</MenuContent>
      </Menu>
    );
  };

  return (
    <MainContainer
      dataTestId={getTestsIds.sitesView()}
      title={bname}
      mainContentChildren={
        <>
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup spaceItems={{ default: 'spaceItemsNone' }} align={{ default: 'alignRight' }}>
                <ToolbarItem>
                  <ToggleGroup>
                    <ToggleGroupItem
                      text={BackboneLabels.TableViewTitle}
                      key={0}
                      buttonId="table-view"
                      isSelected={view === 'table'}
                      onChange={() => setView('table')}
                      icon={<TableIcon />}
                    />
                    <ToggleGroupItem
                      text={BackboneLabels.TopologyViewTitle}
                      key={1}
                      buttonId="topology-view"
                      isSelected={view === 'topology'}
                      onChange={() => setView('topology')}
                      icon={<TopologyIcon />}
                    />
                  </ToggleGroup>
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>

          <Divider />

          {view === 'topology' && (
            <Topology
              sites={sites}
              links={links}
              sid={sid}
              onClickNode={handleOpenLinkModal}
              onClickPanel={({ x, y }) => {
                sitePositionToSave.current = { x, y };
                handleOpenSiteModal();
              }}
              ContextMenuComponent={ContextMenu}
              ref={graphRef}
              onCloseDrawer={handleRemoveSelected}
            />
          )}

          {view === 'table' && (
            <Stack hasGutter>
              <StackItem>
                <Toolbar>
                  <ToolbarContent>
                    <ToolbarItem>
                      <Title headingLevel="h2">{BackboneLabels.Sites}</Title>
                    </ToolbarItem>
                    <ToolbarGroup align={{ default: 'alignRight' }}>
                      <ToolbarItem>
                        <Button onClick={handleOpenSiteModal}>{SiteLabels.CreateSiteTitle}</Button>
                      </ToolbarItem>
                    </ToolbarGroup>
                  </ToolbarContent>
                </Toolbar>

                {siteValidated && (
                  <Alert variant="danger" title={siteValidated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />
                )}

                <SkTable
                  columns={siteColumns}
                  rows={sites}
                  paginationPageSize={DEFAULT_PAGINATION_SIZE}
                  pagination={true}
                  customCells={{
                    emptyCell: (props: LinkCellProps<SiteResponse>) => props.value || '-',
                    deploymentStateCell: (props: LinkCellProps<SiteResponse>) => (
                      <TextContent>
                        <Text component="p">
                          <span
                            className="color-box"
                            style={{ backgroundColor: DeploymentStatusColorMap[props.data.deploymentstate] }}
                          />{' '}
                          {props.data.deploymentstate}
                        </Text>
                      </TextContent>
                    ),
                    lifecycleCell: (props: LinkCellProps<SiteResponse>) => (
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
                    linkCell: (props: LinkCellProps<SiteResponse>) =>
                      LinkCell({
                        ...props,
                        type: 'site',
                        link: `${RoutesPaths.App}/sites/${bname}@${bid}/${props.data.name}@${props.data.id}`
                      }),
                    DateCell: (props: LinkCellProps<SiteResponse>) => (
                      <Timestamp
                        date={new Date(props.value || '')}
                        dateFormat={TimestampFormat.medium}
                        timeFormat={TimestampFormat.medium}
                      />
                    ),
                    actions: ({ data }: { data: SiteResponse }) => (
                      <OverflowMenu breakpoint="lg">
                        <OverflowMenuContent>
                          <OverflowMenuGroup groupType="button">
                            <OverflowMenuItem>
                              <Button onClick={() => handleSiteDelete(data.id)} variant="secondary">
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
                      <Title headingLevel="h2">{BackboneLabels.Links}</Title>
                    </ToolbarItem>
                    <ToolbarGroup align={{ default: 'alignRight' }}>
                      <ToolbarItem>
                        <Button onClick={() => handleOpenLinkModal()}>{LinkLabels.CreateLinkTitle}</Button>
                      </ToolbarItem>
                    </ToolbarGroup>
                  </ToolbarContent>
                </Toolbar>

                {linkValidated && (
                  <Alert variant="danger" title={linkValidated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />
                )}

                <SkTable
                  columns={linkColumns}
                  rows={links}
                  paginationPageSize={DEFAULT_PAGINATION_SIZE}
                  pagination={true}
                  customCells={{
                    linkCellListeningSiteCell: (props: LinkCellProps<LinkResponse>) =>
                      LinkCell({
                        ...props,
                        isDisabled: true,
                        value: sites?.find((site) => site.id === props.data.listeninginteriorsite)?.name,
                        type: 'link',
                        link: ``
                      }),
                    linkCellConnectingSiteCell: (props: LinkCellProps<LinkResponse>) =>
                      LinkCell({
                        ...props,
                        isDisabled: true,
                        value: sites?.find((site) => site.id === props.data.connectinginteriorsite)?.name,
                        type: 'link',
                        link: ``
                      }),
                    actions: ({ data }: { data: LinkResponse }) => (
                      <OverflowMenu breakpoint="lg">
                        <OverflowMenuContent>
                          <OverflowMenuGroup groupType="button">
                            <OverflowMenuItem>
                              <Button onClick={() => handleLinkDelete(data.id)} variant="secondary">
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
            </Stack>
          )}

          <Modal
            title={SiteLabels.CreateSiteTitle}
            isOpen={isSiteOpen}
            variant={ModalVariant.medium}
            onClose={handleCloseSiteModal}
          >
            <SiteForm
              bid={bid}
              position={sitePositionToSave.current}
              onSubmit={handleSiteRefresh}
              onCancel={handleCloseSiteModal}
            />
          </Modal>

          <Modal
            title={LinkLabels.CreateLinkTitle}
            isOpen={isLinkOpen}
            variant={ModalVariant.medium}
            onClose={handleCloseLinkModal}
          >
            <LinkForm
              bid={bid}
              sid={sidSelected.current}
              onSubmit={handleLinkRefresh}
              onCancel={handleCloseLinkModal}
            />
          </Modal>

          <Modal
            title={''}
            isOpen={!!isEditorOpen}
            variant={ModalVariant.large}
            onClose={handleCloseEditorModal}
            actions={
              isEditorOpen === 'automatic'
                ? [
                    <Button key="cancel" variant="link" onClick={handleCloseEditorModal}>
                      {BackboneLabels.CancelBackboneBtn}
                    </Button>
                  ]
                : []
            }
          >
            {sidSelected.current && isEditorOpen === 'automatic' && (
              <>
                <InitialDeploymentForm sid={sidSelected.current} />
                <Button className="pf-v5-u-mt-md" onClick={handleCloseEditorModal}>
                  Done
                </Button>
              </>
            )}
            {sidSelected.current && isEditorOpen === 'bootstrap' && (
              <DeployBootstrap sid={sidSelected.current} onClose={handleCloseEditorModal} />
            )}
          </Modal>
        </>
      }
    />
  );
};

export default Backbone;
