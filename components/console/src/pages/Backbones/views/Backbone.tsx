import { Card, CardBody, Stack, StackItem } from '@patternfly/react-core';
import { useParams } from 'react-router-dom';

import { getTestsIds } from '../../../config/testIds';
import TitleSection from '../../../core/components/TitleSection';
import { getIdAndNameFromUrlParams } from '../../../core/utils/getIdAndNameFromUrlParams';
import MainContainer from '../../../layout/MainContainer';
import BackboneOverview from '../components/BackboneOverview';
import BackboneSites from '../components/BackboneSites';
import { useBackboneDetails } from '../hooks/useBackboneDetails';

const Backbone = function () {
  const { id: urlId } = useParams() as { id: string };
  const { id: bid, name: bname } = getIdAndNameFromUrlParams(urlId);

  // Custom hooks for state management
  const { backbone } = useBackboneDetails(bid || '');

  return (
    <MainContainer
      dataTestId={getTestsIds.sitesView()}
      title={<TitleSection title={bname} resourceType="backbone" />}
      mainContentChildren={
        <Stack hasGutter>
          {/* Backbone Overview Card */}
          <StackItem>
            <BackboneOverview backbone={backbone} backboneId={bid} />
          </StackItem>

          {/* Sites Section */}
          <StackItem>
            <Card>
              <CardBody>
                <BackboneSites bid={bid} />
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      }
    />
  );
};

export default Backbone;
