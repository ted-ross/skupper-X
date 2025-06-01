import { useCallback, useState } from 'react';

import {
  Alert,
  ModalVariant,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Button,
  CodeBlock,
  CodeBlockCode,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  DrawerPanelContent,
  DrawerHead,
  DrawerPanelBody,
  DrawerActions,
  DrawerCloseButton
} from '@patternfly/react-core';
import { ExpandIcon, CompressIcon } from '@patternfly/react-icons';

import { CreateButton } from '../../../core/components/ActionButtons';
import { ApplicationResponse } from '../../../API/REST.interfaces';
import { ALERT_VISIBILITY_TIMEOUT, DEFAULT_PAGINATION_SIZE } from '../../../config/config';
import { ModalWrapper } from '../../../core/components/ModalWrapper';
import SkTable from '../../../core/components/SkTable';
import { useModal } from '../../../core/hooks/useModal';
import { applicationColumns } from '../Applications.constants';
import { ApplicationLifecycleCell, ApplicationActions, linkCellLibrary, linkCell } from './ApplicationCells';
import ApplicationForm from './ApplicationForm';
import { useApplicationOperations } from '../hooks/useApplicationOperations';
import { useApplicationLog } from '../hooks/useApplicationLog';
import labels from '../../../core/config/labels.json';

const ApplicationList = function () {
  // Modal state management
  const {
    isOpen: isApplicationOpen,
    openModal: openApplicationModal,
    closeModal: handleCloseApplicationModal
  } = useModal();

  // Drawer state - always expanded but resizable
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [isDrawerMaximized, setIsDrawerMaximized] = useState(false);
  const [currentApplicationId, setCurrentApplicationId] = useState<string | null>(null);
  const [buildingAppName, setBuildingAppName] = useState<string>('');
  const [buildingAppId, setBuildingAppId] = useState<string | null>(null);

  const { data: logData, isLoading: isLogLoading, error: logError } = useApplicationLog(currentApplicationId);

  const handleOpenApplicationModal = useCallback(() => {
    openApplicationModal();
  }, [openApplicationModal]);

  // Data operations
  const {
    applications,
    error: applicationError,
    deleteApplication: handleApplicationDelete,
    buildApplication: handleApplicationBuild,
    refreshApplications
  } = useApplicationOperations();

  const handleApplicationRefresh = useCallback(() => {
    handleCloseApplicationModal();
    setTimeout(() => {
      refreshApplications();
    }, 200);
  }, [refreshApplications, handleCloseApplicationModal]);

  // Show log in drawer
  const showLogInDrawer = useCallback((appId: string, appName: string) => {
    setBuildingAppName(appName);
    setCurrentApplicationId(appId);
    setIsDrawerExpanded(true);
  }, []);

  // Handle build with log display
  const handleApplicationBuildWithLog = useCallback(
    async (appId: string) => {
      const app = applications.find((a) => a.id === appId);
      if (app) {
        setBuildingAppName(app.name);
        setBuildingAppId(appId);
        try {
          await handleApplicationBuild(appId);

          // Show log in drawer after build
          showLogInDrawer(appId, app.name);
        } catch (error) {
          showLogInDrawer(appId, app.name);
        } finally {
          setBuildingAppId(null);
        }
      }
    },
    [applications, handleApplicationBuild, showLogInDrawer]
  );

  const toggleMaximizeDrawer = () => {
    setIsDrawerMaximized(!isDrawerMaximized);
  };

  const clearLog = () => {
    setCurrentApplicationId(null);
    setBuildingAppName('');
  };

  // Get log content based on current state
  const getLogContent = () => {
    if (isLogLoading) {
      return labels.descriptions.loading;
    }

    if (logError) {
      return `${labels.descriptions.failedToLoad} ${logError}`;
    }

    if (!currentApplicationId) {
      return labels.descriptions.selectApplication;
    }

    return logData || labels.descriptions.noBuildLogAvailable;
  };

  // Drawer sizing
  const drawerSize = isDrawerMaximized ? '70%' : '300px';

  const drawerPanelContent = (
    <DrawerPanelContent isResizable defaultSize={drawerSize} minSize="200px" maxSize="80%">
      <DrawerHead>
        <>
          <span>{labels.buttons.logs}</span>
          {buildingAppName && <span> - {buildingAppName}</span>}
        </>
        <DrawerActions>
          <Button variant="plain" onClick={clearLog}>
            {labels.buttons.clear}
          </Button>
          <Button variant="plain" onClick={toggleMaximizeDrawer}>
            {isDrawerMaximized ? <CompressIcon /> : <ExpandIcon />}
          </Button>
          <DrawerCloseButton onClick={() => setIsDrawerExpanded(false)} />
        </DrawerActions>
      </DrawerHead>

      <DrawerPanelBody>
        <CodeBlock>
          <CodeBlockCode>{getLogContent()}</CodeBlockCode>
        </CodeBlock>
      </DrawerPanelBody>
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={isDrawerExpanded} position="bottom" isInline>
      <DrawerContent panelContent={drawerPanelContent}>
        <DrawerContentBody>
          {/* Fixed header area */}
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <CreateButton onClick={handleOpenApplicationModal}>
                  {labels.buttons.createApplicationTitle}
                </CreateButton>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
          {applicationError && (
            <Alert variant="danger" title={applicationError} isInline timeout={ALERT_VISIBILITY_TIMEOUT} />
          )}{' '}
          {/* Table area */}
          <SkTable
            columns={applicationColumns}
            rows={applications}
            paginationPageSize={DEFAULT_PAGINATION_SIZE}
            pagination={false}
            alwaysShowPagination={false}
            customCells={{
              linkCell,
              linkCellLibrary,
              lifecycleCell: ApplicationLifecycleCell,
              actions: ({ data }: { data: ApplicationResponse }) => (
                <ApplicationActions
                  data={data}
                  onDelete={handleApplicationDelete}
                  onBuild={handleApplicationBuildWithLog}
                  isBuilding={buildingAppId === data.id}
                  showLogButton={true}
                  onShowLog={(appId: string, appName: string) => showLogInDrawer(appId, appName)}
                />
              )
            }}
            emptyStateMessage={labels.emptyStates.noApplicationsFound}
            emptyStateDescription={labels.descriptions.applications}
          />
        </DrawerContentBody>
      </DrawerContent>

      {/* Application creation modal */}
      <ModalWrapper
        title={labels.buttons.createApplicationTitle}
        isOpen={isApplicationOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseApplicationModal}
        showFooter={true}
      >
        <ApplicationForm onSubmit={handleApplicationRefresh} onCancel={handleCloseApplicationModal} />
      </ModalWrapper>
    </Drawer>
  );
};

export default ApplicationList;
