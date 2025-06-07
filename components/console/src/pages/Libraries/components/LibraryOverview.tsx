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

import { LibraryBlockResponse } from '../../../API/REST.interfaces';
import LocaleDateTimeCell from '../../../core/components/LocaleDateTimeCell';
import labels from '../../../core/config/labels';
import { SKUPPERX_TYPE_PREFIX } from '../../Vans/Vans.constants';

interface LibraryOverviewProps {
  library?: LibraryBlockResponse;
  libraryId: string;
}

const LibraryOverview: FC<LibraryOverviewProps> = function ({ library }) {
  const displayType = library?.type ? library.type.replace(SKUPPERX_TYPE_PREFIX, '') : labels.generic.unknown;

  return (
    <Card isPlain>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.name}</DescriptionListTerm>
                <DescriptionListDescription>{library?.name || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.provider}</DescriptionListTerm>
                <DescriptionListDescription>{library?.provider || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.type}</DescriptionListTerm>
                <DescriptionListDescription>{displayType}</DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
          <GridItem span={6}>
            <DescriptionList>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.bodyStyle}</DescriptionListTerm>
                <DescriptionListDescription>{library?.bodystyle || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.revision}</DescriptionListTerm>
                <DescriptionListDescription>{library?.revision || labels.generic.unknown}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{labels.forms.startTime}</DescriptionListTerm>
                <DescriptionListDescription>
                  {library?.created ? (
                    <LocaleDateTimeCell value={library.created} isTableCell={false} compact={false} />
                  ) : (
                    labels.generic.unknown
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </GridItem>
        </Grid>
      </CardBody>
    </Card>
  );
};

export default LibraryOverview;
