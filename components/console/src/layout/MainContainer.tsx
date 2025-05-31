import { FC, ReactElement, Suspense, ReactNode } from 'react';

import { Divider, Flex, PageGroup, PageSection, Title } from '@patternfly/react-core';

import TransitionPage from '../core/components/TransitionPages/Fade';
import LoadingPage from '../pages/shared/Loading';

import '@patternfly/patternfly/patternfly-addons.css';

interface MainContainerProps {
  dataTestId?: string;
  title?: string | ReactNode;
  link?: string;
  linkLabel?: string;
  description?: string;
  isPlain?: boolean;
  hasMainContentPadding?: boolean;
  navigationComponent?: ReactElement;
  mainContentChildren?: ReactElement;
}

const MainContainer: FC<MainContainerProps> = function ({
  dataTestId,
  title,
  description,
  hasMainContentPadding = false,
  navigationComponent,
  mainContentChildren
}) {
  return (
    <TransitionPage>
      <PageGroup data-testid={dataTestId}>
        {title && (
          <PageSection hasBodyWrapper={false} role="sk-heading">
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
          <PageSection
            hasBodyWrapper={false}
            padding={{ default: hasMainContentPadding ? 'noPadding' : 'padding' }}
            isFilled={true}
          >
            <Suspense fallback={<LoadingPage />}>{mainContentChildren}</Suspense>
          </PageSection>
        )}
      </PageGroup>
    </TransitionPage>
  );
};

export default MainContainer;
