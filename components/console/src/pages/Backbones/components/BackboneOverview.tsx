import { FC } from 'react';

import {
  Card,
  CardBody,
  Grid,
  GridItem,
  DescriptionList,
  DescriptionListTerm,
  DescriptionListDescription,
  DescriptionListGroup
} from '@patternfly/react-core';

import { BackboneResponse } from '../../../API/REST.interfaces';
import { LifecycleCell } from '../../../core/components/LifecycleCell';
import { OverviewMultitenantCell } from './BackboneCells';
import labels from '../../../core/config/labels';

interface BackboneOverviewProps {
  backbone: BackboneResponse;
  backboneId: string;
}

// Simplified multitenant cell for overview display
const BackboneOverview: FC<BackboneOverviewProps> = function ({ backbone, backboneId }) {
  return (
    <Card isPlain>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.columns.backboneId}</DescriptionListTerm>
                <DescriptionListDescription>{backboneId || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.columns.name}</DescriptionListTerm>
                <DescriptionListDescription>{backbone.name || labels.generic.unnamed}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.status.status}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LifecycleCell lifecycle={backbone.lifecycle} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.columns.multitenant}</DescriptionListTerm>
                <DescriptionListDescription>
                  <OverviewMultitenantCell backbone={backbone} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  );
};

export default BackboneOverview;
