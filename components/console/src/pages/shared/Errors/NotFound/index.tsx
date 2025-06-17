import { Bullseye, PageSection, Content, ContentVariants } from '@patternfly/react-core';
import labels from '../../../../core/config/labels';

const NotFound = function () {
  return (
    <PageSection hasBodyWrapper={false}>
      <Bullseye data-testid="sk-not-found-view">
        <Content>
          <Content component={ContentVariants.h1}>{labels.errors.pageFoundTitle}</Content>
        </Content>
      </Bullseye>
    </PageSection>
  );
};

export default NotFound;
