import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Alert,
  Button,
  Divider,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  DrawerPanelBody,
  Icon,
  OverflowMenu,
  OverflowMenuContent,
  OverflowMenuGroup,
  OverflowMenuItem,
  Stack,
  StackItem,
  Timestamp,
  TimestampFormat,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import { EditIcon, InProgressIcon, PlusIcon, SyncAltIcon, TrashIcon } from '@patternfly/react-icons';
import { useMutation, useSuspenseQueries } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { RESTApi } from '../../../API/REST.api';
import { HTTPError, BackboneSiteResponse } from '../../../API/REST.interfaces';
import { hexColors } from '../../../config/colors';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import { getTestsIds } from '../../../config/testIds';
import ResourceIcon from '../../../core/components/ResourceIcon';
import SkTable from '../../../core/components/SkTable';
import { getIdAndNameFromUrlParams } from '../../../core/utils/getIdAndNameFromUrlParams';
import MainContainer from '../../../layout/MainContainer';
import { DeploymentStatusColorHexMap, siteColumns } from '../Backbones.constants';
import { BackboneLabels, QueriesBackbones, SiteLabels } from '../Backbones.enum';
import SiteDetailPanel from '../Components/SiteDetailPanel';
import SiteForm from '../Components/SiteForm';

// Type for the transformed site data that matches SiteDetailPanel expectations
type TransformedSite = {
  id: string;
  name: string;
  platformlong: string;
  targetplatform: string;
  lifecycle: string;
  deploymentstate: string;
  firstactivetime: string | null;
  lastheartbeat: string | null;
  tlsexpiration?: string | null;
  tlsrenewal?: string | null;
  failure?: string | null;
  metadata?: string;
};

const Backbone = function () {
  const { id: urlId } = useParams() as { id: string };
  const { id: bid, name: bname } = getIdAndNameFromUrlParams(urlId);

  const sidSelected = useRef<string | undefined>();
  const sitePositionToSave = useRef<{ x: number; y: number }>();

  // const [view, setView] = useState<'table' | 'topology'>('table');

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<TransformedSite | undefined>();

  const [isSiteOpen, setSiteOpen] = useState(false);
  const [siteValidated, setSiteValidated] = useState<string | undefined>();
  const [editingSite, setEditingSite] = useState<BackboneSiteResponse | undefined>();

  const [{ data: sites, refetch: refetchSites }] = useSuspenseQueries({
    queries: [
      {
        queryKey: [QueriesBackbones.GetSites, bid],
        queryFn: () => RESTApi.fetchSites(bid)
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
      }, 0);
    }
  });

  const handleOpenSiteModal = useCallback(() => {
    setSiteOpen(true);
  }, []);

  const handleCloseSiteModal = useCallback(() => {
    setSiteOpen(false);
    sidSelected.current = undefined;
    setEditingSite(undefined);
  }, []);

  const handleSiteEdit = useCallback((site: BackboneSiteResponse) => {
    setEditingSite(site);
    setSiteOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedSite(undefined);
  }, []);

  const handleOpenDrawer = useCallback((site: BackboneSiteResponse) => {
    // Transform the site data to match SiteDetailPanel expectations
    const transformedSite: TransformedSite = {
      id: site.id,
      name: site.name,
      platformlong: site.platformlong,
      targetplatform: site.targetplatform,
      lifecycle: site.lifecycle,
      deploymentstate: site.deploymentstate,
      firstactivetime: site.firstactivetime,
      lastheartbeat: site.lastheartbeat,
      tlsexpiration: site.tlsexpiration || undefined,
      tlsrenewal: site.tlsrenewal || undefined,
      failure: site.failure || undefined,
      metadata: site.metadata
    };
    setSelectedSite(transformedSite);
    setIsDrawerOpen(true);
  }, []);

  const handleSiteDelete = useCallback(
    (siteId: string) => {
      mutationDeleteSite.mutate(siteId);
    },
    [mutationDeleteSite]
  );

  const handleSiteRefresh = useCallback(() => {
    setTimeout(() => {
      refetchSites();
    }, 0);

    handleCloseSiteModal();
  }, [refetchSites, handleCloseSiteModal]);

  useEffect(() => {
    if (selectedSite && !sites.find((s: TransformedSite) => s.id === selectedSite.id)) {
      setIsDrawerOpen(false);
      setSelectedSite(undefined);
    }
  }, [sites, selectedSite]);

  return (
    <MainContainer
      dataTestId={getTestsIds.sitesView()}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ResourceIcon type="backbone" />
          <span>{bname}</span>
        </span>
      }
      mainContentChildren={
        <>
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup align={{ default: 'alignEnd' }}>
                <ToolbarItem>
                  {/* ToggleGroup for topology/list view temporarily hidden as requested
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
                  */}
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>

          <Divider />

          {true && (
            <Drawer isExpanded={isDrawerOpen}>
              <DrawerContent
                panelContent={
                  <DrawerPanelContent isResizable defaultSize="40%" maxSize="40%" minSize="30%">
                    <DrawerHead>
                      <Title headingLevel="h2" size="lg">
                        Site Details
                      </Title>
                      <DrawerActions>
                        <DrawerCloseButton onClick={handleCloseDrawer} />
                      </DrawerActions>
                    </DrawerHead>
                    <DrawerPanelBody>
                      {selectedSite ? (
                        <SiteDetailPanel bid={bid} site={selectedSite} />
                      ) : (
                        <div style={{ minHeight: 200 }} />
                      )}
                    </DrawerPanelBody>
                  </DrawerPanelContent>
                }
              >
                <DrawerContentBody style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Stack hasGutter style={{ flex: 1, minHeight: 0 }}>
                    <StackItem>
                      <Toolbar>
                        <ToolbarContent>
                          <ToolbarItem>
                            <Title headingLevel="h2">{BackboneLabels.Sites}</Title>
                          </ToolbarItem>
                          <ToolbarGroup align={{ default: 'alignEnd' }}>
                            <ToolbarItem>
                              <Button variant="primary" icon={<PlusIcon />} onClick={handleOpenSiteModal}>
                                {SiteLabels.CreateSiteTitle}
                              </Button>
                            </ToolbarItem>
                          </ToolbarGroup>
                        </ToolbarContent>
                      </Toolbar>
                      <div style={{ marginBottom: 12, marginTop: -8, color: '#666', fontSize: '0.95em' }}>
                        Sites are locations in the backbone network where a backbone router is deployed.
                      </div>

                      {siteValidated && (
                        <Alert variant="danger" title={siteValidated} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />
                      )}

                      <SkTable
                        columns={siteColumns}
                        rows={sites}
                        paginationPageSize={DEFAULT_PAGINATION_SIZE}
                        pagination={true}
                        customCells={{
                          emptyCell: (props: { value: string }) => props.value || '-',
                          deploymentStateCell: (props: { data: BackboneSiteResponse }) => (
                            <div>
                              <span
                                className="color-box"
                                style={{
                                  backgroundColor:
                                    DeploymentStatusColorHexMap[
                                      props.data.deploymentstate as keyof typeof DeploymentStatusColorHexMap
                                    ]
                                }}
                              />{' '}
                              {props.data.deploymentstate}
                            </div>
                          ),
                          lifecycleCell: (props: { data: BackboneSiteResponse }) => (
                            <div>
                              <Icon iconSize="md" isInline style={{ verticalAlign: 'middle' }}>
                                {props.data.lifecycle === 'ready' ? (
                                  <SyncAltIcon color={hexColors.Blue400} />
                                ) : (
                                  <InProgressIcon color="#666666" />
                                )}
                              </Icon>{' '}
                              {props.data.lifecycle}
                            </div>
                          ),
                          linkCell: (props: { data: BackboneSiteResponse; value: string }) => (
                            <Button
                              variant="link"
                              isInline
                              onClick={() => handleOpenDrawer(props.data)}
                              style={{ padding: 0, fontSize: 'inherit', display: 'flex', alignItems: 'center' }}
                            >
                              <ResourceIcon type="site" />
                              {props.value}
                            </Button>
                          ),
                          DateCell: (props: { value: string }) => {
                            if (props.value) {
                              return (
                                <Timestamp
                                  date={new Date(props.value)}
                                  dateFormat={TimestampFormat.medium}
                                  timeFormat={TimestampFormat.medium}
                                />
                              );
                            }

                            return '-';
                          },
                          actions: ({ data }: { data: BackboneSiteResponse }) => (
                            <OverflowMenu breakpoint="lg">
                              <OverflowMenuContent>
                                <OverflowMenuGroup groupType="button">
                                  <OverflowMenuItem>
                                    <Button variant="link" onClick={() => handleSiteEdit(data)} icon={<EditIcon />}>
                                      Edit
                                    </Button>
                                  </OverflowMenuItem>
                                  <OverflowMenuItem>
                                    <Button
                                      variant="link"
                                      onClick={() => handleSiteDelete(data.id)}
                                      icon={<TrashIcon />}
                                      isDanger
                                    >
                                      Delete
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
                </DrawerContentBody>
              </DrawerContent>
            </Drawer>
          )}

          <Modal
            title={editingSite ? SiteLabels.EditSiteTitle : SiteLabels.CreateSiteTitle}
            isOpen={isSiteOpen}
            variant={ModalVariant.medium}
            onClose={handleCloseSiteModal}
          >
            <SiteForm
              bid={bid}
              position={sitePositionToSave.current}
              editingSite={editingSite}
              onSubmit={handleSiteRefresh}
              onCancel={handleCloseSiteModal}
            />
          </Modal>
        </>
      }
    />
  );
};

export default Backbone;
