import { Card, CardBody, Stack, StackItem } from '@patternfly/react-core';
import { useParams } from 'react-router-dom';

import TitleSection from '../../../core/components/TitleSection';
import { getIdAndNameFromUrlParams } from '../../../core/utils/getIdAndNameFromUrlParams';
import MainContainer from '../../../layout/MainContainer';
import VanInvitations from '../components/VanInvitations';
import VanMembers from '../components/VanMembers';
import VanOverview from '../components/VanOverview';
import { useVanDetails } from '../hooks/useVanDetails';

const Van = function () {
  const { id: urlId } = useParams() as { id: string };
  const { id: vid, name: vname } = getIdAndNameFromUrlParams(urlId);

  const { van } = useVanDetails(vid || '');

  return (
    <MainContainer
      title={<TitleSection title={vname} resourceType="van" />}
      mainContentChildren={
        <Stack hasGutter>
          {/* Van Overview Card */}
          <StackItem>
            <VanOverview van={van} vanId={vid} />
          </StackItem>

          {/* Invitations Section */}
          <StackItem>
            <Card>
              <CardBody>
                <VanInvitations vanId={vid} />
              </CardBody>
            </Card>
          </StackItem>

          {/* Members Section */}
          <StackItem>
            <Card>
              <CardBody>
                <VanMembers vanId={vid} />
              </CardBody>
            </Card>
          </StackItem>
        </Stack>
      }
    />
  );
};

export default Van;
