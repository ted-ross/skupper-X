import { useCallback, useEffect, useRef, lazy, Suspense } from 'react';

import {
  Alert,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DrawerPanelContent,
  DrawerHead,
  DrawerActions,
  DrawerCloseButton,
  DrawerPanelBody,
  Stack,
  StackItem,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  ModalVariant,
  Flex
} from '@patternfly/react-core';

import { CreateButton } from '../../../core/components/ActionButtons';
import { BackboneSiteResponse } from '../../../API/REST.interfaces';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import { ModalWrapper } from '../../../core/components/ModalWrapper';
import SkTable from '../../../core/components/SkTable';
import { useModal } from '../../../core/hooks/useModal';
import { siteColumns } from '../Backbones.constants';
import Site from './Site';
import { EmptyCell, DeploymentStateCell, SiteLifecycleCell, DateCell, SiteActions, SiteLinkCell } from './SiteCells';
import { useDrawer } from '../hooks/useDrawer';
import { useSiteOperations } from '../hooks/useSiteOperations';
import labels from '../../../core/config/labels';

const SiteForm = lazy(() => import('./SiteForm'));

interface BackboneSitesProps {
  bid: string;
}

const BackboneSites = function ({ bid }: BackboneSitesProps) {
  const sitePositionToSave = useRef<{ x: number; y: number } | undefined>(undefined);

  const { sites, error: siteError, deleteSite, refreshSites } = useSiteOperations(bid);
  const { isOpen: isDrawerOpen, selectedSite, openDrawer, closeDrawer } = useDrawer();
  const {
    isOpen: isSiteModalOpen,
    editingItem: editingSite,
    openModal: openSiteModal,
    openEditModal,
    closeModal: closeSiteModal
  } = useModal<BackboneSiteResponse>();

  const handleSiteRefresh = useCallback(() => {
    // Close modal first for immediate visual feedback
    closeSiteModal();

    // Refresh data with optimized timing to avoid glitches
    setTimeout(() => {
      refreshSites();
    }, 200);
  }, [refreshSites, closeSiteModal]);

  // Close drawer if selected site is deleted
  useEffect(() => {
    if (selectedSite && !sites.find((s) => s.id === selectedSite.id)) {
      closeDrawer();
    }
  }, [sites, selectedSite, closeDrawer]);

  return (
    <>
      <Drawer isExpanded={isDrawerOpen}>
        <DrawerContent
          panelContent={
            <DrawerPanelContent isResizable defaultSize="40%" maxSize="40%" minSize="30%">
              <DrawerHead>
                <Title headingLevel="h2" size="lg">
                  {labels.navigation.siteDetails}
                </Title>
                <DrawerActions>
                  <DrawerCloseButton onClick={closeDrawer} />
                </DrawerActions>
              </DrawerHead>
              <DrawerPanelBody>
                {isDrawerOpen && selectedSite ? (
                  <Site bid={bid} site={selectedSite} />
                ) : (
                  <div className="pf-u-min-height-200" />
                )}
              </DrawerPanelBody>
            </DrawerPanelContent>
          }
        >
          <DrawerContentBody>
            <Stack hasGutter>
              <StackItem>
                <Toolbar>
                  <ToolbarContent>
                    <ToolbarItem>
                      <Flex direction={{ default: 'column' }}>
                        <Title headingLevel="h2">{labels.navigation.sites}</Title>
                        {labels.descriptions.sites}
                      </Flex>
                    </ToolbarItem>
                    <ToolbarGroup align={{ default: 'alignEnd' }}>
                      <ToolbarItem>
                        <CreateButton onClick={openSiteModal}>{labels.buttons.createSiteTitle}</CreateButton>
                      </ToolbarItem>
                    </ToolbarGroup>
                  </ToolbarContent>
                </Toolbar>

                {siteError && <Alert variant="danger" title={siteError} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />}

                <SkTable
                  columns={siteColumns}
                  rows={sites}
                  paginationPageSize={DEFAULT_PAGINATION_SIZE}
                  pagination={true}
                  customCells={{
                    emptyCell: EmptyCell,
                    deploymentStateCell: DeploymentStateCell,
                    lifecycleCell: SiteLifecycleCell,
                    linkCell: (props: { data: BackboneSiteResponse; value: string }) => (
                      <SiteLinkCell data={props.data} value={props.value} onOpenDrawer={openDrawer} />
                    ),
                    DateCell,
                    actions: ({ data }: { data: BackboneSiteResponse }) => (
                      <SiteActions data={data} onEdit={openEditModal} onDelete={deleteSite} />
                    )
                  }}
                />
              </StackItem>
            </Stack>
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>

      {/* Lazy loading + Suspense to eliminate the glitch */}
      {isSiteModalOpen && (
        <ModalWrapper
          title={editingSite ? labels.buttons.editSiteTitle : labels.buttons.createSiteTitle}
          isOpen={isSiteModalOpen}
          variant={ModalVariant.medium}
          onClose={closeSiteModal}
          showFooter={true}
        >
          <Suspense fallback={<div style={{ minHeight: '200px' }}>Loading...</div>}>
            <SiteForm
              bid={bid}
              position={sitePositionToSave.current}
              editingSite={editingSite}
              onSubmit={handleSiteRefresh}
              onCancel={closeSiteModal}
            />
          </Suspense>
        </ModalWrapper>
      )}
    </>
  );
};

export default BackboneSites;
