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

import { VanResponse } from '../../../API/REST.interfaces';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import { LifecycleCell } from '../../../core/components/LifecycleCell';
import LinkCell from '../../../core/components/LinkCell';
import { BackbonesPaths } from '../../Backbones/Backbones.constants';
import labels from '../../../core/config/labels';

interface VanOverviewProps {
  van: VanResponse;
  vanId: string;
}

const VanOverview: FC<VanOverviewProps> = function ({ van, vanId }) {
  return (
    <Card isPlain>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.id}</DescriptionListTerm>
                <DescriptionListDescription>{vanId || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.backbone}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LinkCell
                    data={van}
                    value={van.backbonename || van.backboneId}
                    link={`${BackbonesPaths.path}/${van.backbonename}@${van.backboneId}`}
                    type="backbone"
                  />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.name}</DescriptionListTerm>
                <DescriptionListDescription>{van.name || labels.generic.unnamed}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.status}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LifecycleCell lifecycle={van.lifecycle} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.startTime}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocaleDateTimeCell value={van.starttime} placeholder={labels.generic.notStarted} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.endTime}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocaleDateTimeCell value={van.endtime} placeholder="-" />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.tlsExpiration}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocaleDateTimeCell value={van.tlsexpiration} placeholder={labels.generic.notAvailable} />
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.generic.tlsRenewal}</DescriptionListTerm>
                <DescriptionListDescription>
                  <LocaleDateTimeCell value={van.tlsrenewal} placeholder={labels.generic.notAvailable} />
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  );
};

export default VanOverview;
