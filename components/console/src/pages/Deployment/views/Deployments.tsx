import MainContainer from '../../../layout/MainContainer';
import labels from '../../../core/config/labels';
import DeploymentList from '../components/DeploymentList';

const Deployments = function () {
  return (
    <MainContainer
      title={labels.navigation.deployments}
      description={labels.descriptions.deployments}
      mainContentChildren={<DeploymentList />}
    />
  );
};

export default Deployments;
