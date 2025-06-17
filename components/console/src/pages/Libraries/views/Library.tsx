import { useParams } from 'react-router-dom';
import TitleSection from '../../../core/components/TitleSection';
import { getIdAndNameFromUrlParams } from '../../../core/utils/getIdAndNameFromUrlParams';
import MainContainer from '../../../layout/MainContainer';
import LibraryDetails from '../components/LibraryDetails';
import { useLibraryDetails } from '../hooks/useLibraryDetails';

const Library = function () {
  const { id: urlId } = useParams() as { id: string };
  const { id: libraryId, name: libraryName } = getIdAndNameFromUrlParams(urlId);

  // Custom hooks for state management
  const { library } = useLibraryDetails(libraryId);

  return (
    <MainContainer
      title={<TitleSection title={libraryName || library?.name} resourceType="library" />}
      mainContentChildren={<LibraryDetails library={library} libraryId={libraryId} />}
    />
  );
};

export default Library;
