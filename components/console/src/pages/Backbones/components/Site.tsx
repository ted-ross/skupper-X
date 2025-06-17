import { useState, useCallback, lazy, Suspense } from 'react';

import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Button,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListDescription,
  DescriptionListGroup,
  Split,
  SplitItem,
  Label,
  Stack,
  StackItem,
  Title,
  Divider,
  Spinner,
  Tooltip,
  Alert,
  AlertActionCloseButton,
  ModalVariant
} from '@patternfly/react-core';
import { LinkIcon, ExclamationCircleIcon, TrashIcon } from '@patternfly/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { CreateButton } from '../../../core/components/ActionButtons';
import ModalWrapper from '../../../core/components/ModalWrapper';

const AccessPointForm = lazy(() => import('./AccessPointForm'));
const LinkForm = lazy(() => import('./LinkForm'));

import { RESTApi } from '../../../API/REST.api';
import { HTTPError } from '../../../API/REST.interfaces';
import EmptyData from '../../../core/components/EmptyData';
import TitleSection from '../../../core/components/TitleSection';
import { useAccessPointOperations } from '../hooks/useAccessPointOperations';
import { useMutationWithCacheInvalidation, CacheInvalidationPresets } from '../../../core/hooks/useMutationWithCacheInvalidation';
import labels from '../../../core/config/labels';
import { QueriesBackbones } from '../Backbones.enum';

interface SiteProps {
  bid: string;
  site: {
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
}

const Site = function ({ bid, site }: SiteProps) {
  // State for Access Point modal
  const [isAccessPointModalOpen, setIsAccessPointModalOpen] = useState(false);
  // State for Link modal
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  // State for Link errors
  const [linkError, setLinkError] = useState<string | undefined>();

  // Query client for invalidating queries
  const queryClient = useQueryClient();

  // Access Point operations hook
  const {
    error: accessPointError,
    deleteAccessPoint,
    clearError: clearAccessPointError,
    isDeleting
  } = useAccessPointOperations(site.id);

  // Fetch Access Points for this site
  const {
    data: accessPoints = [],
    isLoading: isAccessPointsLoading,
    error: accessPointsError,
    refetch: refetchAccessPoints
  } = useQuery({
    queryKey: ['accessPoints', site.id],
    queryFn: () => RESTApi.fetchAccessPointsForSite(site.id)
  });

  // Fetch Links for this site
  const {
    data: links = [],
    isLoading: isLinksLoading,
    error: linksError,
    refetch: refetchLinks
  } = useQuery({
    queryKey: ['links', site.id],
    queryFn: () => RESTApi.fetchLinksForSite(site.id)
  });

  // Fetch all access points in this backbone to check for available peer access points
  const { data: allAccessPoints = [] } = useQuery({
    queryKey: ['allAccessPoints', bid],
    queryFn: () => RESTApi.fetchAccessPointsForBackbone(bid)
  });

  // Fetch all sites in this backbone to get site names for access point display
  const { data: allSites = [] } = useQuery({
    queryKey: [QueriesBackbones.GetSites, bid],
    queryFn: () => RESTApi.fetchSites(bid)
  });

  // Check if there are available peer access points in other sites
  const availablePeerAccessPoints = allAccessPoints.filter((ap) => ap.kind === 'peer' && ap.interiorsite !== site.id);
  const hasAvailableDestinationSites = availablePeerAccessPoints.length > 0;

  // Create a mapping from access point ID to "sitename/accesspointname" format
  const accessPointDisplayMap = allAccessPoints.reduce(
    (acc, ap) => {
      const site = allSites.find((s) => s.id === ap.interiorsite);
      const siteName = site ? site.name : 'Unknown Site';
      acc[ap.id] = `${siteName}/${ap.name}`;
      return acc;
    },
    {} as Record<string, string>
  );

  // Helper functions for modal management
  const handleOpenAccessPointModal = useCallback(() => {
    setIsAccessPointModalOpen(true);
  }, []);

  const handleCloseAccessPointModal = useCallback(() => {
    setIsAccessPointModalOpen(false);
  }, []);

  const handleAccessPointSubmit = useCallback(() => {
    refetchAccessPoints();
    // Invalidate the allAccessPoints query so LinkForm sees the new access point
    queryClient.invalidateQueries({ queryKey: ['allAccessPoints', bid] });
    handleCloseAccessPointModal();
  }, [refetchAccessPoints, queryClient, bid, handleCloseAccessPointModal]);

  // Helper functions for link modal management
  const handleOpenLinkModal = useCallback(() => {
    setIsLinkModalOpen(true);
  }, []);

  const handleCloseLinkModal = useCallback(() => {
    setIsLinkModalOpen(false);
  }, []);

  const handleLinkSubmit = useCallback(() => {
    // Refresh links data
    refetchLinks();
    // Invalidate sites query to refresh the dropdown in LinkForm
    queryClient.invalidateQueries({ queryKey: [QueriesBackbones.GetSites, bid] });
    handleCloseLinkModal();
  }, [refetchLinks, queryClient, bid, handleCloseLinkModal]);

  // Handler for deleting access points
  const handleDeleteAccessPoint = useCallback(
    (apid: string) => {
      deleteAccessPoint(apid);
    },
    [deleteAccessPoint]
  );

  // Mutation for deleting links
  const deleteLinkMutation = useMutationWithCacheInvalidation(
    (lid: string) => RESTApi.deleteLink(lid),
    CacheInvalidationPresets.deleteLink(bid),
    {
      onError: (data: HTTPError) => {
        // Check if this is a foreign key constraint error
        if (
          data.descriptionMessage?.includes('foreign key constraint') ||
          data.descriptionMessage?.includes('is still referenced')
        ) {
          setLinkError(labels.errors.linkDeletionConstraint);
        } else {
          setLinkError(data.descriptionMessage || labels.errors.linkDeletionGeneric);
        }
      },
      onSuccess: () => {
        // Clear any previous errors on successful deletion
        setLinkError(undefined);
        refetchLinks();
      },
      onMutate: () => {
        // Clear any previous error when starting a new delete operation
        setLinkError(undefined);
      }
    }
  );

  // Handler for deleting links
  const handleDeleteLink = useCallback(
    (lid: string) => {
      deleteLinkMutation.mutate(lid);
    },
    [deleteLinkMutation]
  );

  // Helper function to clear link errors
  const clearLinkError = useCallback(() => {
    setLinkError(undefined);
  }, []);

  // Helper function to get status color
  const getStatusColor = (lifecycle: string) => {
    switch (lifecycle.toLowerCase()) {
      case 'ready':
      case 'active':
        return 'green';
      case 'partial':
      case 'pending':
      case 'connecting':
        return 'blue';
      case 'failed':
        return 'red';
      default:
        return 'grey';
    }
  };

  return (
    <Stack hasGutter>
      {/* Site Details */}
      <StackItem>
        <Card>
          <CardBody>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.columns.targetPlatform}</DescriptionListTerm>
                <DescriptionListDescription>{site.platformlong}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.columns.tlsCertificateExpiration}</DescriptionListTerm>
                <DescriptionListDescription>
                  {site.tlsexpiration || labels.generic.notAvailable}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.columns.tlsCertificateRenewal}</DescriptionListTerm>
                <DescriptionListDescription>
                  {site.tlsrenewal || labels.generic.notAvailable}
                </DescriptionListDescription>
              </DescriptionListGroup>
              {site.failure && (
                <DescriptionListGroup>
                  <DescriptionListTerm>{labels.columns.failure}</DescriptionListTerm>
                  <DescriptionListDescription>
                    <Label variant="filled" color="red">
                      {site.failure}
                    </Label>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>
          </CardBody>
        </Card>
      </StackItem>

      {/* Access Points */}
      <StackItem>
        <Card>
          <CardHeader>
            <CardTitle>
              <Split hasGutter>
                <SplitItem>
                  <TitleSection title={labels.navigation.accessPoints} resourceType="accessPoint" headingLevel={'h4'} />
                </SplitItem>
                <SplitItem isFilled />
                <SplitItem>
                  <CreateButton onClick={handleOpenAccessPointModal}>{labels.buttons.addApTitle}</CreateButton>
                </SplitItem>
              </Split>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {/* Error Alert for Access Point Operations */}
            {accessPointError && (
              <Alert
                variant="danger"
                title={labels.errors.accessPointError}
                isInline
                actionClose={<AlertActionCloseButton onClose={clearAccessPointError} />}
                className="pf-u-mb-md"
              >
                {accessPointError}
              </Alert>
            )}

            {isAccessPointsLoading ? (
              <Spinner size="md" />
            ) : accessPointsError ? (
              <EmptyData
                message={labels.errors.errorLoadingAccessPoints}
                description={labels.errors.unableToFetchAccessPoints}
                icon={ExclamationCircleIcon}
              />
            ) : accessPoints.length === 0 ? (
              <EmptyData
                message={labels.emptyStates.noAccessPointsFound}
                description={labels.emptyStates.noAccessPointsConfigured}
              />
            ) : (
              <Stack hasGutter>
                {accessPoints.map((accessPoint, index) => (
                  <div key={accessPoint.id}>
                    <StackItem>
                      <Stack hasGutter={false}>
                        <StackItem>
                          <Split hasGutter>
                            <SplitItem>
                              <Title headingLevel="h4" size="md">
                                {accessPoint.name}
                              </Title>
                            </SplitItem>
                            <SplitItem>
                              <Label color={getStatusColor(accessPoint.lifecycle)}>{accessPoint.lifecycle}</Label>
                            </SplitItem>
                            <SplitItem isFilled />
                            <SplitItem>
                              <Button
                                variant="link"
                                icon={<TrashIcon />}
                                onClick={() => handleDeleteAccessPoint(accessPoint.id)}
                                isDanger
                                size="sm"
                                isLoading={isDeleting}
                                isDisabled={isDeleting}
                              >
                                {isDeleting ? labels.buttons.deleting : labels.buttons.delete}
                              </Button>
                            </SplitItem>
                          </Split>
                        </StackItem>
                        <StackItem>
                          {accessPoint.kind} - {accessPoint.bindhost || labels.generic.noHostBound} -{' '}
                          {accessPoint.hostname && accessPoint.port
                            ? `${accessPoint.hostname}:${accessPoint.port}`
                            : labels.generic.noAddress}{' '}
                        </StackItem>
                      </Stack>
                    </StackItem>
                    {index < accessPoints.length - 1 && (
                      <StackItem>
                        <Divider />
                      </StackItem>
                    )}
                  </div>
                ))}
              </Stack>
            )}
          </CardBody>
        </Card>
      </StackItem>

      {/* Inter-Router Links */}
      <StackItem>
        <Card>
          <CardHeader>
            <CardTitle>
              <Split hasGutter>
                <SplitItem>
                  <TitleSection
                    title={labels.navigation.outgoingInterRouterLinks}
                    resourceType="link"
                    headingLevel={'h4'}
                  />
                </SplitItem>
                <SplitItem isFilled />
                <SplitItem>
                  {!hasAvailableDestinationSites ? (
                    <Tooltip content={labels.errors.noPeerAccessPointsTooltip}>
                      <CreateButton icon={<LinkIcon />} onClick={() => {}} disabled>
                        {labels.buttons.addLinkTitle}
                      </CreateButton>
                    </Tooltip>
                  ) : (
                    <CreateButton icon={<LinkIcon />} onClick={handleOpenLinkModal}>
                      {labels.buttons.addLinkTitle}
                    </CreateButton>
                  )}
                </SplitItem>
              </Split>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {/* Error Alert for Link Operations */}
            {linkError && (
              <Alert
                variant="danger"
                title={labels.errors.linkError}
                isInline
                actionClose={<AlertActionCloseButton onClose={clearLinkError} />}
                className="pf-u-mb-md"
              >
                {linkError}
              </Alert>
            )}

            {!hasAvailableDestinationSites && (
              <Alert variant="warning" title={labels.errors.noPeerAccessPointsTitle} isInline>
                {labels.errors.noPeerAccessPointsDescription}
              </Alert>
            )}

            {isLinksLoading ? (
              <Spinner size="md" />
            ) : linksError ? (
              <EmptyData
                message={labels.errors.errorLoadingLinks}
                description={labels.errors.unableToFetchLinks}
                icon={ExclamationCircleIcon}
              />
            ) : links.length === 0 ? (
              <EmptyData message={labels.emptyStates.noLinksFound} description={labels.emptyStates.noLinksConfigured} />
            ) : (
              <Stack hasGutter>
                {links.map((link, index) => (
                  <div key={link.id}>
                    <StackItem>
                      <Stack hasGutter={false}>
                        <StackItem>
                          <Split hasGutter>
                            <SplitItem>
                              <Title headingLevel="h4" size="md">
                                {accessPointDisplayMap[link.accesspoint] || link.accesspoint}
                              </Title>
                            </SplitItem>
                            <SplitItem isFilled />
                            <SplitItem>
                              <Button
                                variant="link"
                                icon={<TrashIcon />}
                                onClick={() => handleDeleteLink(link.id)}
                                isDanger
                                size="sm"
                                isLoading={deleteLinkMutation.isPending}
                                isDisabled={deleteLinkMutation.isPending}
                              >
                                {deleteLinkMutation.isPending ? labels.buttons.deleting : labels.buttons.delete}
                              </Button>
                            </SplitItem>
                          </Split>
                        </StackItem>
                        <StackItem>
                          {labels.columns.cost}: {link.cost}
                        </StackItem>
                      </Stack>
                    </StackItem>
                    {index < links.length - 1 && (
                      <StackItem>
                        <Divider />
                      </StackItem>
                    )}
                  </div>
                ))}
              </Stack>
            )}
          </CardBody>
        </Card>
      </StackItem>

      {/* Lazy loading + Suspense to eliminate the glitch */}
      {isAccessPointModalOpen && (
        <ModalWrapper
          title={labels.buttons.createAccessPoint}
          isOpen={isAccessPointModalOpen}
          variant={ModalVariant.medium}
          onClose={handleCloseAccessPointModal}
          showFooter={true}
        >
          <Suspense fallback={<div style={{ minHeight: '200px' }}>Loading...</div>}>
            <AccessPointForm
              bid={bid}
              siteId={site.id}
              onSubmit={handleAccessPointSubmit}
              onCancel={handleCloseAccessPointModal}
            />
          </Suspense>
        </ModalWrapper>
      )}

      {/* Lazy loading + Suspense to eliminate the glitch */}
      {isLinkModalOpen && (
        <ModalWrapper
          title={labels.buttons.addLinkTitle}
          isOpen={isLinkModalOpen}
          variant={ModalVariant.medium}
          onClose={handleCloseLinkModal}
          showFooter={true}
        >
          <Suspense fallback={<div style={{ minHeight: '200px' }}>Loading...</div>}>
            <LinkForm bid={bid} sid={site.id} onSubmit={handleLinkSubmit} onCancel={handleCloseLinkModal} />
          </Suspense>
        </ModalWrapper>
      )}
    </Stack>
  );
};

export default Site;
