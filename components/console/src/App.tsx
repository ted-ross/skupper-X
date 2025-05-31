import { Suspense } from 'react';

import { Page, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from '@patternfly/react-core';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

import '@patternfly/react-core/dist/styles/base.css';
import './App.css';
import SkBreadcrumb from './core/components/SkBreadcrumb';
import SkUpdateDataButton from './core/components/SkUpdateButton';
import Footer from './layout/Footer';
import SkHeader from './layout/Header';
import RouteContainer from './layout/RouteContainer';
import SkSidebar from './layout/SideBar';
import ErrorConsole from './pages/shared/Errors/Console';
import LoadingPage from './pages/shared/Loading';
import { routes } from './routes';

const App = function () {
  return (
    <Page
      masthead={<SkHeader />}
      sidebar={<SkSidebar />}
      breadcrumb={
        <Toolbar style={{ padding: 0 }}>
          <ToolbarContent style={{ padding: 0 }}>
            <ToolbarItem>
              <SkBreadcrumb />
            </ToolbarItem>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <SkUpdateDataButton />
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      }
      isContentFilled
      isManagedSidebar
      isBreadcrumbGrouped
      additionalGroupedContent={
        <QueryErrorResetBoundary>
          {({ reset }) => (
            <ErrorBoundary onReset={reset} FallbackComponent={ErrorConsole}>
              <Suspense fallback={<LoadingPage />}>
                <RouteContainer>{routes}</RouteContainer>
                <Footer />
              </Suspense>
            </ErrorBoundary>
          )}
        </QueryErrorResetBoundary>
      }
    />
  );
};

export default App;
