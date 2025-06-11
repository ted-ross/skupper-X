import { FC } from 'react';

import { PageSection } from '@patternfly/react-core';

interface FooterProps {
  className?: string;
}

const Footer: FC<FooterProps> = function ({ className = '' }) {
  return (
    <PageSection
      variant="secondary"
      className={`sk-footer ${className} pf-u-text-align-center pf-u-p-sm pf-u-min-height-50 pf-u-display-flex pf-u-align-items-center pf-u-justify-content-center`}
    >
      {/* Footer content removed */}
    </PageSection>
  );
};

export default Footer;
