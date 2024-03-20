import { FC } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { RESTApi } from '@API/REST.api';
import { getIdAndNameFromUrlParams } from '@core/utils/getIdAndNameFromUrlParams';

import { QueriesBackbones } from '../Backbones.enum';

const SiteContainer = function () {
  const { sid: urlId } = useParams() as { sid: string };
  const { id: sid } = getIdAndNameFromUrlParams(urlId);

  return <Site sid={sid} />;
};

export const Site: FC<{ sid: string }> = function ({ sid }) {
  const { data: site } = useSuspenseQuery({
    queryKey: [QueriesBackbones.GetSite, sid],
    queryFn: () => RESTApi.searchSite(sid)
  });

  return <pre>{JSON.stringify(site, null, 2)}</pre>;
};

export default SiteContainer;
