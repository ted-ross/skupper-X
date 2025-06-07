import { Bullseye, Spinner } from '@patternfly/react-core';

import { getTestsIds } from '../../../config/testIds';

const SkIsLoading = function ({ customSize = '150px' }) {
  return (
    <div
      className="pf-u-position-absolute pf-u-w-100 pf-u-h-100 pf-u-left-0 pf-u-right-0 pf-u-top-0 pf-u-bottom-0"
      style={{
        backgroundColor: 'rgba(3, 3, 3, 0.1)',
        zIndex: 1
      }}
    >
      <Bullseye data-testid={getTestsIds.loadingView()}>
        <Spinner diameter={customSize} />
      </Bullseye>
    </div>
  );
};

export default SkIsLoading;
