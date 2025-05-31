import {
  Brand,
  Masthead,
  MastheadLogo,
  MastheadContent,
  MastheadMain,
  MastheadToggle,
  MastheadBrand,
  PageToggleButton,
  Toolbar,
  ToolbarContent,
  ToolbarGroup
} from '@patternfly/react-core';
import { BarsIcon } from '@patternfly/react-icons';

import { brandLogo } from '../config/config';

export enum HeaderLabels {
  Logout = 'Logout',
  UserDropdownTestId = 'user-dropdown-testId',
  OpenShiftAuth = 'openshift'
}

const SkHeader = function () {
  return (
    <Masthead className="sk-header" data-testid="sk-header">
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton variant="plain">
            <BarsIcon />
          </PageToggleButton>
        </MastheadToggle>
        <MastheadBrand data-codemods>
          <MastheadLogo data-codemods>
            <Brand src={brandLogo} alt="logo" heights={{ default: '45px' }} />
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>

      <MastheadContent>
        <Toolbar isFullHeight>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }} gap={{ default: 'gapMd' }}>
              {/* Add any future header actions here */}
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
};

export default SkHeader;
