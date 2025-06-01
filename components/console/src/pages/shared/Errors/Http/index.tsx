import { FC, MouseEventHandler } from 'react';

import { Button, Divider, List, ListItem, PageSection, Content, ContentVariants, Title } from '@patternfly/react-core';

import labels from '../../../../core/config/labels';

const ErrorHttp: FC<{ code?: string; message?: string; onReset?: MouseEventHandler<HTMLButtonElement> }> = function ({
  code,
  message,
  onReset
}) {
  return (
    <PageSection hasBodyWrapper={false}>
      <Content>
        <Title headingLevel="h1">{message || labels.errors.httpErrorTitle}</Title>
        <Title headingLevel="h2">{code || ''}</Title>
        <Divider />

        <Content component={ContentVariants.h2}>{labels.errors.httpErrorHelp}</Content>

        <List>
          <ListItem>{labels.errors.httpErrorStepOpenDevTools}</ListItem>
          <ListItem>{labels.errors.httpErrorStepNetworkConsole}</ListItem>
          <ListItem>{labels.errors.httpErrorStepScreenshot}</ListItem>
          <ListItem>
            <Button id="sk-try-again" variant="primary" onClick={onReset}>
              {labels.buttons.tryAgain}
            </Button>
          </ListItem>
        </List>
      </Content>
    </PageSection>
  );
};
export default ErrorHttp;
