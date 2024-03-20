import { FC } from 'react';

import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { useQuery } from '@tanstack/react-query';

import { RESTApi } from '@API/REST.api';

import { QueriesBackbones } from '../Backbones.enum';

const InvitationYamlForm: FC<{
  iid: string;
}> = function ({ iid }) {
  const { data: code } = useQuery({
    queryKey: [QueriesBackbones.GetInvitationsYAML, iid],
    queryFn: () => RESTApi.searchInvitationYAML(iid)
  });

  return (
    <CodeEditor
      isDownloadEnabled
      isCopyEnabled
      isLanguageLabelVisible
      height="400px"
      code={code}
      language={Language.yaml}
      isDarkTheme
      isLineNumbersVisible
      isReadOnly
      downloadFileName="invitation"
    />
  );
};

export default InvitationYamlForm;
