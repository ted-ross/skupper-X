import React, { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Flex,
  FlexItem,
  Icon,
  Stack,
  StackItem,
  Title,
  Button
} from '@patternfly/react-core';
import {
  InProgressIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CompressIcon,
  ExpandIcon
} from '@patternfly/react-icons';
import { AccessPointBadge } from '../Topology.utils';
import { hexColors } from '../../../config/colors';
import { DeploymentStatusColorHexMap } from '../../Backbones/Backbones.constants';
import labels from '../../../core/config/labels';

interface SiteNodeProps {
  data: {
    label: string;
    platform?: string;
    lifecycle?: string;
    type?: string;
    deploymentState?: string;
    accessPointBadges?: AccessPointBadge[];
  };
}

// Utility function to get border color based on lifecycle status
const getLifecycleBorderColor = (lifecycle?: string): string => {
  switch (lifecycle) {
    case 'active':
    case 'deployed':
    case 'ready':
    case 'ready-automatic':
      return hexColors.Green500; // Green for active/deployed/ready states
    case 'ready-bootstrap':
      return hexColors.Orange400; // Orange for ready-bootstrap
    case 'not-ready':
    case 'failed':
      return hexColors.Red500; // Red for not-ready/failed
    case 'partial':
    case 'new':
      return hexColors.Orange300; // Light orange for partial/new
    default:
      return '#ccc'; // Default gray
  }
};

// Utility function to get deployment state icon and color based on deployment state
const getDeploymentStateIconAndColor = (
  deploymentState?: string
): { icon: React.ReactElement; iconColor: string; displayName: string } => {
  switch (deploymentState) {
    case 'deployed':
      return {
        icon: <CheckCircleIcon />,
        iconColor: DeploymentStatusColorHexMap['deployed'] || hexColors.Green500,
        displayName: 'Deployed'
      };
    case 'ready-automatic':
      return {
        icon: <CheckCircleIcon />,
        iconColor: DeploymentStatusColorHexMap['ready-automatic'] || hexColors.Purple500,
        displayName: 'Ready Automatic'
      };
    case 'ready-bootstrap':
      return {
        icon: <InProgressIcon />,
        iconColor: DeploymentStatusColorHexMap['ready-bootstrap'] || hexColors.Orange100,
        displayName: 'Ready Bootstrap'
      };
    case 'not-ready':
      return {
        icon: <ExclamationCircleIcon />,
        iconColor: DeploymentStatusColorHexMap['not-ready'] || hexColors.Red500,
        displayName: 'Not Ready'
      };
    default:
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Black300,
        displayName: deploymentState || 'Unknown'
      };
  }
};

// Utility function to get lifecycle icon and color based on lifecycle status
const getLifecycleIconAndColor = (
  lifecycle?: string
): { icon: React.ReactElement; iconColor: string; displayName: string } => {
  switch (lifecycle) {
    case 'ready':
      return {
        icon: <CheckCircleIcon />,
        iconColor: hexColors.Green500,
        displayName: labels.status.active
      };
    case 'active':
      return {
        icon: <CheckCircleIcon />,
        iconColor: hexColors.Green500,
        displayName: labels.status.active
      };
    case 'partial':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Orange400,
        displayName: labels.status.pending
      };
    case 'new':
    case 'initializing':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Blue400,
        displayName: labels.status.initializing
      };
    case 'skx_cr_created':
    case 'creating_resources':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Cyan500,
        displayName: labels.status.creatingResources
      };
    case 'cm_cert_created':
    case 'generating_certificates':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Purple400,
        displayName: labels.status.generatingCertificates
      };
    case 'cm_issuer_created':
    case 'configuring_issuer':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Indigo500,
        displayName: labels.status.configuringIssuer
      };
    case 'deploying':
    case 'starting':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Teal500,
        displayName: labels.status.deploying
      };
    case 'expired':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Orange700,
        displayName: labels.status.expired
      };
    case 'failed':
    case 'error':
      return {
        icon: <ExclamationCircleIcon />,
        iconColor: hexColors.Red600,
        displayName: labels.status.failed
      };
    case 'terminating':
    case 'deleting':
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Grey500,
        displayName: labels.status.terminating
      };
    default:
      return {
        icon: <InProgressIcon />,
        iconColor: hexColors.Black300,
        displayName: labels.status.unknown
      };
  }
};

const SiteNode: React.FC<SiteNodeProps> = ({ data }) => {
  const { label, platform, lifecycle, deploymentState, accessPointBadges } = data;

  // State for expand/collapse functionality
  const [expanded, setExpanded] = useState(false);

  // Toggle expand/collapse state
  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  // Create access point indicators (small colored circles)
  const renderAccessPointIndicators = () => {
    if (!accessPointBadges || accessPointBadges.length === 0) return null;

    return (
      <Flex gap={{ default: 'gapXs' }}>
        {accessPointBadges.map((badge, index) => (
          <FlexItem key={index}>
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: badge.color,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                color: badge.count === 1 ? badge.color : 'white',
                fontWeight: 'bold'
              }}
              title={`${badge.type}: ${badge.count}`}
            >
              {badge.count}
            </div>
          </FlexItem>
        ))}
      </Flex>
    );
  };

  const renderExpandedContent = () => (
    <Stack hasGutter>
      {platform && (
        <StackItem>
          <Flex>
            <FlexItem style={{ minWidth: '60px', fontWeight: 'bold', fontSize: '12px' }}>Platform:</FlexItem>
            <FlexItem style={{ fontSize: '12px' }}>{platform}</FlexItem>
          </Flex>
        </StackItem>
      )}
      {deploymentState && (
        <StackItem>
          <Flex>
            <FlexItem style={{ minWidth: '60px', fontWeight: 'bold', fontSize: '12px' }}>Type:</FlexItem>
            <FlexItem style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {(() => {
                const { icon, iconColor, displayName } = getDeploymentStateIconAndColor(deploymentState);
                return (
                  <>
                    <Icon iconSize="sm" isInline style={{ color: iconColor }}>
                      {icon}
                    </Icon>
                    <span style={{ color: iconColor }}>{displayName}</span>
                  </>
                );
              })()}
            </FlexItem>
          </Flex>
        </StackItem>
      )}
      {lifecycle && (
        <StackItem>
          <Flex>
            <FlexItem style={{ minWidth: '60px', fontWeight: 'bold', fontSize: '12px' }}>Status:</FlexItem>
            <FlexItem style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {(() => {
                const { icon, iconColor, displayName } = getLifecycleIconAndColor(lifecycle);
                return (
                  <>
                    <Icon iconSize="sm" isInline style={{ color: iconColor }}>
                      {icon}
                    </Icon>
                    <span style={{ color: iconColor }}>{displayName}</span>
                  </>
                );
              })()}
            </FlexItem>
          </Flex>
        </StackItem>
      )}
      {accessPointBadges && accessPointBadges.length > 0 && (
        <StackItem>
          <Flex direction={{ default: 'column' }}>
            <FlexItem style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>Access Points:</FlexItem>
            {accessPointBadges.map((badge, index) => (
              <FlexItem key={index}>
                <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: badge.color,
                        borderRadius: '50%'
                      }}
                    />
                  </FlexItem>
                  <FlexItem style={{ fontSize: '11px' }}>
                    {badge.type}: {badge.count}
                  </FlexItem>
                </Flex>
              </FlexItem>
            ))}
          </Flex>
        </StackItem>
      )}
    </Stack>
  );

  const renderCollapsedContent = () => (
    <Stack hasGutter>
      <StackItem style={{ textAlign: 'left' }}>
        <div style={{ fontSize: '11px', color: '#666' }}>Click top-right icon for details</div>
      </StackItem>
      {accessPointBadges && accessPointBadges.length > 0 && (
        <StackItem style={{ textAlign: 'left', marginTop: '2px' }}>
          <Flex
            gap={{ default: 'gapSm' }}
            alignItems={{ default: 'alignItemsCenter' }}
            justifyContent={{ default: 'justifyContentFlexStart' }}
          >
            <FlexItem>
              <div style={{ fontSize: '9px', color: '#666', fontWeight: 'bold' }}>AP</div>
            </FlexItem>
            <FlexItem>{renderAccessPointIndicators()}</FlexItem>
          </Flex>
        </StackItem>
      )}
    </Stack>
  );

  return (
    <Card
      isCompact
      style={{
        width: expanded ? '280px' : '200px',
        minHeight: expanded ? '140px' : '85px',
        borderRadius: '8px',
        border: `2px solid ${getLifecycleBorderColor(lifecycle)}`,
        cursor: 'pointer',
        backgroundColor: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}
    >
      <CardHeader
        style={{ padding: expanded ? '8px 12px' : '4px 12px', borderBottom: expanded ? '1px solid #eee' : 'none' }}
        actions={{
          actions: (
            <Button
              variant="plain"
              onClick={toggleExpand}
              style={{ padding: '4px', minWidth: 'auto' }}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <CompressIcon /> : <ExpandIcon />}
            </Button>
          ),
          hasNoOffset: true
        }}
      >
        <CardTitle>
          <Title headingLevel="h6" size="md" style={{ fontSize: '14px', margin: 0 }}>
            {label}
          </Title>
        </CardTitle>
      </CardHeader>
      <CardBody style={{ padding: expanded ? '8px 12px' : '2px 12px' }}>
        {expanded ? renderExpandedContent() : renderCollapsedContent()}
      </CardBody>
    </Card>
  );
};

export default SiteNode;
