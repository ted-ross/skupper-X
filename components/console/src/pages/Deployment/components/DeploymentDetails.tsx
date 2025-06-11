import React, { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardExpandableContent,
  Stack,
  StackItem,
  Grid,
  GridItem,
  Icon,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListDescription,
  DescriptionListGroup,
  Alert,
  CodeBlock,
  CodeBlockCode,
  Spinner
} from '@patternfly/react-core';
import { HistoryIcon, CogIcon } from '@patternfly/react-icons';

import { DeploymentDetailsResponse } from '../../../API/REST.interfaces';
import { RESTApi } from '../../../API/REST.api';
import { useDeploymentDetails } from '../hooks/useDeploymentDetails';
import { useDeploymentLog } from '../hooks/useDeploymentLog';
import LifecycleCell from '../../../core/components/LifecycleCell';
import labels from '../../../core/config/labels';

interface DeploymentDetailsProps {
  deployment?: DeploymentDetailsResponse;
  deploymentId: string;
}

interface DeploymentSection {
  key: string;
  title: string;
  icon: React.ComponentType;
  enabled: boolean;
  description: string;
}

const DeploymentOverview: React.FC<{ deployment?: DeploymentDetailsResponse }> = ({ deployment }) => {
  return (
    <Card isPlain>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.name}</DescriptionListTerm>
                <DescriptionListDescription>{deployment?.appname || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.name}</DescriptionListTerm>
                <DescriptionListDescription>{deployment?.appname || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.status}</DescriptionListTerm>
                <DescriptionListDescription>
                  {deployment?.lifecycle ? (
                    <LifecycleCell lifecycle={deployment.lifecycle as any} />
                  ) : (
                    labels.generic.unknown
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.navigation.vans}</DescriptionListTerm>
                <DescriptionListDescription>{deployment?.vanname || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.id}</DescriptionListTerm>
                <DescriptionListDescription>{deployment?.id || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  );
};

const DeploymentConfiguration: React.FC<{ deploymentId: string }> = ({ deploymentId }) => {
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [vanMembers, setVanMembers] = useState<{ id: string; name: string }[]>([]);

  // Get deployment details to access the VAN ID
  const { deployment } = useDeploymentDetails(deploymentId);

  // Fetch VAN members when deployment data is available
  React.useEffect(() => {
    const fetchVanMembers = async () => {
      if (deployment?.van) {
        try {
          const members = await RESTApi.fetchMembers(deployment.van);
          setVanMembers(members);
          if (members.length > 0 && !selectedSite) {
            setSelectedSite(members[0].id);
          }
        } catch (error) {
          console.error('Failed to fetch VAN members:', error);
        }
      }
    };

    fetchVanMembers();
  }, [deployment?.van, selectedSite]);

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId);
  };

  const generateDownloadUrl = (siteId: string, siteName: string) => {
    return `compose/v1alpha1/deployments/${deploymentId}/site/${siteId}/sitedata/${siteName}.yaml`;
  };

  return (
    <Stack hasGutter>
      <StackItem>
        <Card isPlain>
          <CardBody>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.navigation.applications}</DescriptionListTerm>
                <DescriptionListDescription>{deployment?.appname || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.navigation.vans}</DescriptionListTerm>
                <DescriptionListDescription>{deployment?.vanname || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.status}</DescriptionListTerm>
                <DescriptionListDescription>
                  {deployment?.lifecycle ? (
                    <LifecycleCell lifecycle={deployment.lifecycle as any} />
                  ) : (
                    labels.generic.unknown
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      </StackItem>

      {deployment?.lifecycle === 'deployed' && vanMembers.length > 0 && (
        <StackItem>
          <Card>
            <CardHeader>
              <CardTitle>{labels.descriptions.configuration}</CardTitle>
            </CardHeader>
            <CardBody>
              <Stack hasGutter>
                <StackItem>
                  <Grid hasGutter>
                    <GridItem span={6}>
                      <DescriptionList>
                        <DescriptionListGroup>
                          <DescriptionListTerm>Select VAN Member Site</DescriptionListTerm>
                          <DescriptionListDescription>
                            <select
                              value={selectedSite}
                              onChange={(e) => handleSiteChange(e.target.value)}
                              style={{ width: '100%', padding: '8px' }}
                            >
                              {vanMembers.map((member) => (
                                <option key={member.id} value={member.id}>
                                  {member.name}
                                </option>
                              ))}
                            </select>
                          </DescriptionListDescription>
                        </DescriptionListGroup>
                      </DescriptionList>
                    </GridItem>
                    <GridItem span={6}>
                      {selectedSite && (
                        <DescriptionList>
                          <DescriptionListGroup>
                            <DescriptionListTerm>Download Configuration</DescriptionListTerm>
                            <DescriptionListDescription>
                              <a
                                href={generateDownloadUrl(
                                  selectedSite,
                                  vanMembers.find((m) => m.id === selectedSite)?.name || 'config'
                                )}
                                download
                                style={{
                                  color: '#0066cc',
                                  textDecoration: 'none',
                                  fontWeight: 'bold'
                                }}
                              >
                                Download {vanMembers.find((m) => m.id === selectedSite)?.name}.yaml
                              </a>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        </DescriptionList>
                      )}
                    </GridItem>
                  </Grid>
                </StackItem>

                <StackItem>
                  <DescriptionList>
                    <DescriptionListGroup>
                      <DescriptionListTerm>Instructions</DescriptionListTerm>
                      <DescriptionListDescription>
                        <div>
                          Download the configuration file for each VAN member site and deploy it to the respective
                          Kubernetes namespace.
                        </div>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  </DescriptionList>
                </StackItem>
              </Stack>
            </CardBody>
          </Card>
        </StackItem>
      )}

      {deployment?.lifecycle !== 'deployed' && (
        <StackItem>
          <Alert variant="info" title={labels.emptyStates.deploymentConfigurationNotAvailable} isInline>
            Configuration files are only available after the deployment has been successfully deployed.
          </Alert>
        </StackItem>
      )}
    </Stack>
  );
};

const DeploymentHistory: React.FC<{ deploymentId: string }> = ({ deploymentId }) => {
  const { data: logData, isLoading: isLogLoading, error: logError } = useDeploymentLog(deploymentId);

  const getLogContent = () => {
    if (isLogLoading) {
      return (
        <Stack hasGutter>
          <StackItem>
            <Spinner size="md" />
          </StackItem>
          <StackItem>{labels.descriptions.loading || 'Loading deployment log...'}</StackItem>
        </Stack>
      );
    }

    if (logError) {
      return (
        <Alert variant="warning" title={labels.emptyStates.failedToLoadDeploymentLog} isInline>
          {`${labels.descriptions.failedToLoad || 'Failed to load log:'} ${logError}`}
        </Alert>
      );
    }

    if (!logData) {
      return (
        <Alert variant="info" title={labels.emptyStates.noDeploymentLogAvailable} isInline>
          {labels.emptyStates.noHistoryAvailable || 'No deployment log available for this deployment.'}
        </Alert>
      );
    }

    return (
      <CodeBlock>
        <CodeBlockCode>{logData}</CodeBlockCode>
      </CodeBlock>
    );
  };

  return (
    <Stack hasGutter>
      <StackItem>
        <Card isPlain>
          <CardBody>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.navigation.deployments} Log</DescriptionListTerm>
                <DescriptionListDescription>
                  View the deployment log output and history for this deployment.
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      </StackItem>

      <StackItem>
        <Card>
          <CardHeader>
            <CardTitle>{labels.generic.history || 'History'} & Log Output</CardTitle>
          </CardHeader>
          <CardBody>{getLogContent()}</CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
};

const getDeploymentSections = (): DeploymentSection[] => [
  {
    key: 'configuration',
    title: labels.generic.configuration,
    icon: CogIcon,
    enabled: true,
    description: labels.descriptions.configuration
  },
  {
    key: 'history',
    title: labels.generic.history,
    icon: HistoryIcon,
    enabled: true,
    description: labels.descriptions.history
  }
];

const DeploymentDetails: React.FC<DeploymentDetailsProps> = ({ deployment, deploymentId }) => {
  // State for expandable cards
  const [expandedCards, setExpandedCards] = useState<{
    configuration: boolean;
    history: boolean;
  }>({
    configuration: false,
    history: false
  });

  const onExpand = (_event: React.MouseEvent, cardId: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardId]: !prev[cardId as keyof typeof expandedCards]
    }));
  };

  const cardSections = getDeploymentSections();

  return (
    <Stack hasGutter>
      {/* Deployment Overview Card */}
      <StackItem>
        <DeploymentOverview deployment={deployment} />
      </StackItem>

      {/* Expandable Section Cards */}
      <StackItem>
        <Grid hasGutter>
          {cardSections.map((section) => (
            <GridItem key={section.key} span={12} lg={12}>
              <Card isFullHeight isExpanded={expandedCards[section.key as keyof typeof expandedCards]}>
                <CardHeader
                  onExpand={section.enabled ? (_event, _cardId) => onExpand(_event, section.key) : undefined}
                  toggleButtonProps={{
                    id: `toggle-button-${section.key}`,
                    'aria-label': `${section.title} Details`,
                    'aria-expanded': expandedCards[section.key as keyof typeof expandedCards]
                  }}
                >
                  <CardTitle>
                    <Icon isInline>
                      <section.icon />
                    </Icon>{' '}
                    {section.title}
                  </CardTitle>
                </CardHeader>

                <CardExpandableContent>
                  <CardBody>
                    <Stack hasGutter>
                      <StackItem>{section.description}</StackItem>
                      <StackItem>
                        {section.key === 'configuration' && <DeploymentConfiguration deploymentId={deploymentId} />}
                        {section.key === 'history' && <DeploymentHistory deploymentId={deploymentId} />}
                      </StackItem>
                    </Stack>
                  </CardBody>
                </CardExpandableContent>
              </Card>
            </GridItem>
          ))}
        </Grid>
      </StackItem>
    </Stack>
  );
};

export default DeploymentDetails;
