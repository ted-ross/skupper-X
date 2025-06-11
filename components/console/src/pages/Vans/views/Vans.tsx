import MainContainer from '../../../layout/MainContainer';
import TitleSection from '../../../core/components/TitleSection';
import labels from '../../../core/config/labels';
import VanList from '../components/VanList';

const Vans = function () {
  return (
    <MainContainer
      title={<TitleSection title={labels.navigation.vans} headingLevel="h1" />}
      description={labels.descriptions.vans}
      mainContentChildren={<VanList />}
    />
  );
};

export default Vans;
