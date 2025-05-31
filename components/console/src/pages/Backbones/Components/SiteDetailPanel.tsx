import { useState, useCallback } from 'react';

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
  Alert
} from '@patternfly/react-core';
import { Modal, ModalVariant } from '@patternfly/react-core/deprecated';
import { PlusIcon, LinkIcon, ExclamationCircleIcon, TrashIcon } from '@patternfly/react-icons';
import { useQuery, useMutation } from '@tanstack/react-query';

import AccessPointForm from './AccessPointForm';
import LinkForm from './LinkForm';
import { RESTApi } from '../../../API/REST.api';
import EmptyData from '../../../core/components/EmptyData';
import ResourceIcon from '../../../core/components/ResourceIcon';
import { BackboneLabels } from '../Backbones.enum';

interface SiteDetailPanelProps {
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

const SiteDetailPanel = function ({ bid, site }: SiteDetailPanelProps) {
  // State for Access Point modal
  const [isAccessPointModalOpen, setIsAccessPointModalOpen] = useState(false);
  // State for Link modal
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

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

  // Mutation for deleting access points
  const deleteAccessPointMutation = useMutation({
    mutationFn: (apid: string) => RESTApi.deleteAccessPoint(apid),
    onSuccess: () => {
      refetchAccessPoints();
    }
  });

  // Helper functions for modal management
  const handleOpenAccessPointModal = useCallback(() => {
    setIsAccessPointModalOpen(true);
  }, []);

  const handleCloseAccessPointModal = useCallback(() => {
    setIsAccessPointModalOpen(false);
  }, []);

  const handleAccessPointSubmit = useCallback(() => {
    refetchAccessPoints();
    handleCloseAccessPointModal();
  }, [refetchAccessPoints, handleCloseAccessPointModal]);

  // Helper functions for link modal management
  const handleOpenLinkModal = useCallback(() => {
    setIsLinkModalOpen(true);
  }, []);

  const handleCloseLinkModal = useCallback(() => {
    setIsLinkModalOpen(false);
  }, []);

  const handleLinkSubmit = useCallback(() => {
    refetchLinks();
    handleCloseLinkModal();
  }, [refetchLinks, handleCloseLinkModal]);

  // Handler for deleting access points
  const handleDeleteAccessPoint = useCallback(
    (apid: string) => {
      deleteAccessPointMutation.mutate(apid);
    },
    [deleteAccessPointMutation]
  );

  // Mutation for deleting links
  const deleteLinkMutation = useMutation({
    mutationFn: (lid: string) => RESTApi.deleteLink(lid),
    onSuccess: () => {
      refetchLinks();
    }
  });

  // Handler for deleting links
  const handleDeleteLink = useCallback(
    (lid: string) => {
      deleteLinkMutation.mutate(lid);
    },
    [deleteLinkMutation]
  );

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

  // Helper function to get status label
  const getStatusLabel = (lifecycle: string) => {
    switch (lifecycle.toLowerCase()) {
      case 'ready':
        return 'Active';
      case 'partial':
        return 'Pending';
      case 'failed':
        return 'Failed';
      default:
        return lifecycle;
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
                <DescriptionListTerm>Target Platform</DescriptionListTerm>
                <DescriptionListDescription>{site.platformlong}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>TLS Certificate Expiration</DescriptionListTerm>
                <DescriptionListDescription>{site.tlsexpiration || 'Not available'}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>TLS Certificate Renewal</DescriptionListTerm>
                <DescriptionListDescription>{site.tlsrenewal || 'Not available'}</DescriptionListDescription>
              </DescriptionListGroup>
              {site.failure && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Failure</DescriptionListTerm>
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
                  <ResourceIcon type="accessPoint" />
                </SplitItem>
                <SplitItem>Access Points</SplitItem>
                <SplitItem isFilled />
                <SplitItem>
                  <Button variant="primary" icon={<PlusIcon />} onClick={handleOpenAccessPointModal}>
                    Add
                  </Button>
                </SplitItem>
              </Split>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {isAccessPointsLoading ? (
              <Spinner size="md" />
            ) : accessPointsError ? (
              <EmptyData
                message="Error loading access points"
                description="Unable to fetch access points for this site"
                icon={ExclamationCircleIcon}
              />
            ) : accessPoints.length === 0 ? (
              <EmptyData message="No access points found" description="This site has no access points configured" />
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
                              <Label color={getStatusColor(accessPoint.lifecycle)}>
                                {getStatusLabel(accessPoint.lifecycle)}
                              </Label>
                            </SplitItem>
                            <SplitItem isFilled />
                            <SplitItem>
                              <Button
                                variant="link"
                                icon={<TrashIcon />}
                                onClick={() => handleDeleteAccessPoint(accessPoint.id)}
                                isDanger
                                size="sm"
                              >
                                Delete
                              </Button>
                            </SplitItem>
                          </Split>
                        </StackItem>
                        <StackItem>
                          <small>
                            {accessPoint.hostname && accessPoint.port
                              ? `${accessPoint.hostname}:${accessPoint.port}`
                              : 'No address'}{' '}
                            - {accessPoint.kind}
                          </small>
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
                  <ResourceIcon type="link" />
                </SplitItem>
                <SplitItem>{BackboneLabels.OutgoingInterRouterLinks}</SplitItem>
                <SplitItem isFilled />
                <SplitItem>
                  {accessPoints.filter((ap) => ap.kind === 'peer').length === 0 ? (
                    <Tooltip content="Create a peer access point first to enable link creation">
                      <Button variant="primary" icon={<LinkIcon />} isDisabled>
                        Create
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button variant="primary" icon={<LinkIcon />} onClick={handleOpenLinkModal}>
                      Create
                    </Button>
                  )}
                </SplitItem>
              </Split>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {accessPoints.filter((ap) => ap.kind === 'peer').length === 0 && (
              <Alert variant="warning" title="Link creation requires peer access points" isInline>
                To create links between sites, you must first add a peer access point to this site. Peer access points
                enable inter-site connectivity for backbone networks.
              </Alert>
            )}
            {isLinksLoading ? (
              <Spinner size="md" />
            ) : linksError ? (
              <EmptyData
                message="Error loading links"
                description="Unable to fetch links for this site"
                icon={ExclamationCircleIcon}
              />
            ) : links.length === 0 ? (
              <EmptyData message="No links found" description="This site has no links configured" />
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
                                {link.accesspoint}
                              </Title>
                            </SplitItem>
                            <SplitItem>
                              <Label color="green">Connected</Label>
                            </SplitItem>
                            <SplitItem isFilled />
                            <SplitItem>
                              <Button
                                variant="link"
                                icon={<TrashIcon />}
                                onClick={() => handleDeleteLink(link.id)}
                                isDanger
                                size="sm"
                              >
                                Delete
                              </Button>
                            </SplitItem>
                          </Split>
                        </StackItem>
                        <StackItem>
                          <small>
                            Cost: {link.cost} | Target Site: {link.connectinginteriorsite}
                          </small>
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

      {/* Access Point Modal */}
      <Modal
        title="Create Access Point"
        isOpen={isAccessPointModalOpen}
        variant={ModalVariant.medium}
        onClose={handleCloseAccessPointModal}
      >
        <AccessPointForm siteId={site.id} onSubmit={handleAccessPointSubmit} onCancel={handleCloseAccessPointModal} />
      </Modal>

      {/* Link Modal */}
      <Modal title="Create Link" isOpen={isLinkModalOpen} variant={ModalVariant.medium} onClose={handleCloseLinkModal}>
        <LinkForm bid={bid} sid={site.id} onSubmit={handleLinkSubmit} onCancel={handleCloseLinkModal} />
      </Modal>
    </Stack>
  );
};

export default SiteDetailPanel;
