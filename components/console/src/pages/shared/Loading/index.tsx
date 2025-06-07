import { CSSProperties, FC } from 'react';

import { Bullseye, PageSection, Spinner } from '@patternfly/react-core';

import { getTestsIds } from '../../../config/testIds';

const floatLoader: CSSProperties = {
  top: 0,
  position: 'absolute',
  right: 0,
  width: '100%',
  height: '100%',
  zIndex: 100
};

interface LoadingPageProps {
  isFLoating?: boolean;
}

const LoadingPage: FC<LoadingPageProps> = function ({ isFLoating = false }) {
  return (
    <div style={isFLoating ? floatLoader : undefined}>
      <PageSection hasBodyWrapper={false}>
        <Bullseye className="sk-loading-page" data-testid={getTestsIds.loadingView()}>
          <Spinner size="xl" />
        </Bullseye>
      </PageSection>
    </div>
  );
};

export default LoadingPage;
