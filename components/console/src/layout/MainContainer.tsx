import { FC, ReactElement, Suspense } from 'react';

import {
  Divider,
  Flex,
  PageGroup,
  PageSection,
  Title
} from '@patternfly/react-core';

import LoadingPage from '@pages/shared/Loading';

import Footer from './Footer';
import TransitionPage from '../core/components/TransitionPages/Fade';

import '@patternfly/patternfly/patternfly-addons.css';

interface MainContainerProps {
  dataTestId?: string;
  title?: string;
  link?: string;
  linkLabel?: string;
  description?: string;
  isPlain?: boolean;
  hasMainContentPadding?: boolean;
  navigationComponent?: ReactElement;
  mainContentChildren?: ReactElement;
  showFooter?: boolean;
}

const MainContainer: FC<MainContainerProps> = function ({
  dataTestId,
  title,
  description,
  hasMainContentPadding = false,
  navigationComponent,
  mainContentChildren,
  showFooter = true
}) {
  return (
    <TransitionPage>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
        <div style={{ flex: 1 }}>
          <PageGroup data-testid={dataTestId}>
            {title && (
              <PageSection hasBodyWrapper={false} role="sk-heading" >
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
                  <div>
                    <Title headingLevel="h1">{title}</Title>
                    {description && <p>{description}</p>}
                  </div>
                </Flex>
              </PageSection>
            )}

            {navigationComponent && (
              <>
                <Flex>{navigationComponent}</Flex>
                <Divider />
              </>
            )}
            {mainContentChildren && (
              <PageSection hasBodyWrapper={false} padding={{ default: hasMainContentPadding ? 'noPadding' : 'padding' }} isFilled={true}>
                <Suspense fallback={<LoadingPage />}>{mainContentChildren}</Suspense>
              </PageSection>
            )}
          </PageGroup>
        </div>
        {showFooter && <Footer />}
      </div>
    </TransitionPage>
  );
};

export default MainContainer;
