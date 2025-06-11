import { Nav, NavItem, NavList, NavGroup } from '@patternfly/react-core';
import { Link, useLocation } from 'react-router-dom';

import { NAV_GROUPS, NAV_SINGLE_ITEMS } from '../../../config/navGroups';

const NavBar = function () {
  const { pathname } = useLocation();

  return (
    <Nav data-testid="sk-nav-bar-component">
      {NAV_GROUPS.map((group) => (
        <NavGroup key={group.label} title={group.label} data-testid={`nav-group-${group.label.toLowerCase()}`}>
          <NavList>
            {group.items.map(({ name, path }) => (
              <NavItem key={path} isActive={pathname.startsWith(`${path}`)}>
                <Link to={`${path}`}>{name}</Link>
              </NavItem>
            ))}
          </NavList>
        </NavGroup>
      ))}
      {/* Render single items as top-level NavItems */}
      <NavList>
        {NAV_SINGLE_ITEMS.map(({ name, path }) => (
          <NavItem key={path} isActive={pathname.startsWith(`${path}`)}>
            <Link to={`${path}`}>{name}</Link>
          </NavItem>
        ))}
      </NavList>
    </Nav>
  );
};

export default NavBar;
