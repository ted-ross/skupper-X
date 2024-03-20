import { FormEvent, useEffect, useState } from 'react';

import {
  Brand,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadMain,
  MastheadToggle,
  PageToggleButton,
  Switch,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';
import { BarsIcon } from '@patternfly/react-icons';

import { DARK_THEME_CLASS, brandLogo } from '@config/config';
import { getThemePreference, removeThemePreference, setThemePreference } from '@core/utils/isDarkTheme';

export enum HeaderLabels {
  Logout = 'Logout',
  DarkMode = ' Dark mode',
  DarkModeTestId = 'dark-mode-testId',
  UserDropdownTestId = 'user-dropdown-testId',
  OpenShiftAuth = 'openshift'
}

const SkHeader = function () {
  return (
    <Masthead className="sk-header" data-testid="sk-header">
      <MastheadToggle>
        <PageToggleButton variant="plain">
          <BarsIcon />
        </PageToggleButton>
      </MastheadToggle>

      <MastheadMain>
        <MastheadBrand>
          <Brand src={brandLogo} alt="logo" heights={{ default: '45px' }} />
        </MastheadBrand>
      </MastheadMain>

      <MastheadContent>
        <Toolbar isFullHeight>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignRight' }} spacer={{ default: 'spacerMd' }}>
              <ToolbarItem>
                <DarkModeSwitch />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
};

export default SkHeader;

export const DarkModeSwitch = function () {
  const [isChecked, setIsChecked] = useState<boolean>(false);

  const handleChange = (_event: FormEvent<HTMLInputElement>, checked: boolean) => {
    setIsChecked(checked);

    checked ? setThemePreference(DARK_THEME_CLASS) : removeThemePreference();
  };

  useEffect(() => {
    const isDarkTheme = getThemePreference() ? true : false;
    setIsChecked(isDarkTheme);
  }, []);

  return (
    <Switch
      label={HeaderLabels.DarkMode}
      labelOff={HeaderLabels.DarkMode}
      isChecked={isChecked}
      onChange={handleChange}
      data-testid={HeaderLabels.DarkModeTestId}
    />
  );
};
