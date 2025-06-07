import React from 'react';
import { Icon } from '@patternfly/react-core';
import { InProgressIcon, CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';

import { hexColors } from '../../../config/colors';
import labels from '../../../core/config/labels';
import { LifecycleCellProps } from './LifecycleCell.interfaces';

const LifecycleCell: React.FC<LifecycleCellProps> = ({ lifecycle }) => {
  let icon = null;
  let iconColor = '';
  let displayName = '';

  switch (lifecycle) {
    case 'ready':
      icon = <CheckCircleIcon />;
      iconColor = hexColors.Green500;
      displayName = labels.status.active;
      break;
    case 'active':
      icon = <CheckCircleIcon />;
      iconColor = hexColors.Green500;
      displayName = labels.status.active;
      break;
    case 'partial':
      icon = <InProgressIcon />;
      iconColor = hexColors.Orange400;
      displayName = labels.status.pending;
      break;
    case 'new':
    case 'initializing':
      icon = <InProgressIcon />;
      iconColor = hexColors.Blue400;
      displayName = labels.status.initializing;
      break;
    case 'skx_cr_created':
    case 'creating_resources':
      icon = <InProgressIcon />;
      iconColor = hexColors.Cyan500;
      displayName = labels.status.creatingResources;
      break;
    case 'cm_cert_created':
    case 'generating_certificates':
      icon = <InProgressIcon />;
      iconColor = hexColors.Purple400;
      displayName = labels.status.generatingCertificates;
      break;
    case 'cm_issuer_created':
    case 'configuring_issuer':
      icon = <InProgressIcon />;
      iconColor = hexColors.Indigo500;
      displayName = labels.status.configuringIssuer;
      break;
    case 'deploying':
    case 'starting':
      icon = <InProgressIcon />;
      iconColor = hexColors.Teal500;
      displayName = labels.status.deploying;
      break;
    case 'expired':
      icon = <InProgressIcon />;
      iconColor = hexColors.Orange700;
      displayName = labels.status.expired;
      break;
    case 'failed':
    case 'error':
      icon = <ExclamationCircleIcon />;
      iconColor = hexColors.Red600;
      displayName = labels.status.failed;
      break;
    case 'terminating':
    case 'deleting':
      icon = <InProgressIcon />;
      iconColor = hexColors.Grey500;
      displayName = labels.status.terminating;
      break;
    default:
      icon = <InProgressIcon />;
      iconColor = hexColors.Black300;
      displayName = labels.status.unknown;
  }

  return (
    <div>
      <Icon iconSize="md" isInline className="pf-u-align-items-center">
        {React.cloneElement(icon, { style: { color: iconColor } })}
      </Icon>{' '}
      <span style={{ color: iconColor }}>{displayName}</span>
    </div>
  );
};

export default LifecycleCell;
