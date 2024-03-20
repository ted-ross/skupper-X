import { Suspense } from 'react';

import { Page, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from '@patternfly/react-core';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

import SkBreadcrumb from '@core/components/SkBreadcrumb';
import SkUpdateDataButton from '@core/components/SkUpdateButton';
import { getThemePreference, reflectThemePreference } from '@core/utils/isDarkTheme';
import SkHeader from '@layout/Header';
import RouteContainer from '@layout/RouteContainer';
import ErrorConsole from '@pages/shared/Errors/Console';
import LoadingPage from '@pages/shared/Loading';
import { routes } from 'routes';

import '@patternfly/react-core/dist/styles/base.css';
import './App.css';

const App = function () {
  reflectThemePreference(getThemePreference());

  return (
    <Page
      header={<SkHeader />}
      breadcrumb={
        <Toolbar style={{ padding: 0 }}>
          <ToolbarContent style={{ padding: 0 }}>
            <ToolbarItem>
              <SkBreadcrumb />
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignRight' }}>
              <SkUpdateDataButton />
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      }
      isManagedSidebar
      isBreadcrumbGrouped
      additionalGroupedContent={
        <QueryErrorResetBoundary>
          {({ reset }) => (
            <ErrorBoundary onReset={reset} FallbackComponent={ErrorConsole}>
              <Suspense fallback={<LoadingPage />}>
                <RouteContainer>{routes}</RouteContainer>
              </Suspense>
            </ErrorBoundary>
          )}
        </QueryErrorResetBoundary>
      }
    />
  );
};

export default App;
