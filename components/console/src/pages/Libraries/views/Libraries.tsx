import MainContainer from '../../../layout/MainContainer';
import labels from '../../../core/config/labels';
import LibraryList from '../components/LibraryList';

const Libraries = function () {
  return (
    <MainContainer
      title={labels.navigation.libraries}
      description={labels.descriptions.libraries}
      mainContentChildren={<LibraryList />}
    />
  );
};

export default Libraries;
