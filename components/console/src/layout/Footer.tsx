import { FC } from 'react';

import { PageSection } from '@patternfly/react-core';

interface FooterProps {
  className?: string;
}

const Footer: FC<FooterProps> = function ({ className = '' }) {
  return (
    <PageSection
      variant="secondary"
      className={`sk-footer ${className}`}
      style={{
        backgroundColor: '#acb3b9',
        textAlign: 'center',
        padding: '5px',
        minHeight: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <p style={{ margin: 0, fontSize: '14px' }}>copyright &copy; Skupper-X</p>
    </PageSection>
  );
};

export default Footer;
