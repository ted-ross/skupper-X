import MainContainer from '../../../layout/MainContainer';
import TitleSection from '../../../core/components/TitleSection';
import labels from '../../../core/config/labels';
import ApplicationList from '../components/ApplicationsList';

const Applications = function () {
  return (
    <MainContainer
      title={<TitleSection title={labels.navigation.applications} headingLevel="h1" />}
      description={labels.descriptions.applications}
      mainContentChildren={<ApplicationList />}
    />
  );
};

export default Applications;
