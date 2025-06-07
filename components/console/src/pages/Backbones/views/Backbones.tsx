import MainContainer from '../../../layout/MainContainer';
import TitleSection from '../../../core/components/TitleSection';
import labels from '../../../core/config/labels';
import BackboneList from '../components/BackboneList';

const Backbones = function () {
  return (
    <MainContainer
      title={<TitleSection title={labels.navigation.backbones} headingLevel="h1" />}
      description={labels.descriptions.backbones}
      mainContentChildren={<BackboneList />}
    />
  );
};

export default Backbones;
