import { FC } from 'react';

import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '../../../API/REST.api';
import { QueriesBackbones } from '../Backbones.enum';

const IncomingLinks: FC<{
  sid: string;
}> = function ({ sid }) {
  const { data: code } = useQuery({
    queryKey: [QueriesBackbones.GetIncomingLinks, sid],
    queryFn: () => RESTApi.fetchLinksForSite(sid)
  });

  return (
    <CodeEditor
      isDownloadEnabled
      isCopyEnabled
      isLanguageLabelVisible
      height="400px"
      code={code ? JSON.stringify(code, null, 2) : ''}
      language={Language.yaml}
      isDarkTheme
      isLineNumbersVisible
      isReadOnly
      downloadFileName="incoming-links"
    />
  );
};

export default IncomingLinks;
