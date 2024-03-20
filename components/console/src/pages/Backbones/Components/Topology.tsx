import { ComponentType, FC, Ref, Suspense, forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import {
  Alert,
  Button,
  Divider,
  Drawer,
  DrawerActions,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Stack,
  StackItem,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem
} from '@patternfly/react-core';

import { LinkResponse, SiteResponse } from '@API/REST.interfaces';
import skupperIcon from '@assets/skupper.svg';
import { CUSTOM_ITEMS_NAMES } from '@core/components/Graph/Graph.constants';
import {
  GraphEdge,
  GraphNode,
  GraphReactAdaptorExposedMethods,
  GraphReactAdaptorProps
} from '@core/components/Graph/Graph.interfaces';
import GraphReactAdaptor from '@core/components/Graph/ReactAdaptor';
import LoadingPage from '@pages/shared/Loading';

import { DeploymentStatusColorHexMap } from '../Backbones.constants';
import { TopologyLabels } from '../Backbones.enum';
import { Site } from '../views/Site';

const Topology: FC<{
  sid?: string;
  sites: SiteResponse[];
  links: LinkResponse[];
  onClickNode?: (sid: string) => void;
  onClickPanel?: ({ x, y }: { x: number; y: number }) => void;
  GraphComponent?: ComponentType<GraphReactAdaptorProps>;
  onCloseDrawer?: () => void;
  ref?: Ref<GraphReactAdaptorExposedMethods | undefined>;
  ContextMenuComponent?: ComponentType<{ item: GraphNode; target: 'edge' | 'node' | undefined }>;
}> = forwardRef(
  (
    { sid, sites, links, onClickPanel, GraphComponent = GraphReactAdaptor, ContextMenuComponent, onCloseDrawer },
    ref
  ) => {
    const graphRef = useRef<GraphReactAdaptorExposedMethods>();
    const lastPosition = useRef<{ x: number; y: number }>();

    const nodes = convertSitesToNodes(sites);
    const edges = convertRouterLinksToEdges(links);

    //exported methods
    useImperativeHandle(ref, () => ({
      closeContextMenu: () => {
        if (graphRef.current?.closeContextMenu) {
          graphRef.current.closeContextMenu();
        }
      }
    }));

    const handleClickCanvas = useCallback(
      ({ x, y }: { x: number; y: number }) => {
        onClickPanel?.({ x, y });
        lastPosition.current = { x, y };
      },
      [onClickPanel]
    );

    const handleSaveTopology = () => {
      if (graphRef.current?.saveNodePositions) {
        graphRef.current?.saveNodePositions();
      }
    };

    const handleCloseDrawer = () => {
      onCloseDrawer?.();
    };

    if (!nodes) {
      return <LoadingPage />;
    }

    const panelContent = (
      <DrawerPanelContent isResizable>
        <DrawerHead>
          <Title headingLevel="h1">{TopologyLabels.Details}</Title>
          <DrawerActions>
            <DrawerCloseButton onClick={handleCloseDrawer} />
          </DrawerActions>
        </DrawerHead>
        <DrawerPanelBody style={{ overflow: 'auto' }}>
          {sid && (
            <Suspense>
              <Site sid={sid} />
            </Suspense>
          )}
        </DrawerPanelBody>
      </DrawerPanelContent>
    );

    return (
      <Stack>
        <StackItem>
          <Toolbar>
            <ToolbarContent>
              <ToolbarGroup align={{ default: 'alignRight' }}>
                <ToolbarItem>
                  <Button onClick={handleSaveTopology}>{TopologyLabels.SaveTopology}</Button>
                </ToolbarItem>
              </ToolbarGroup>
            </ToolbarContent>
          </Toolbar>
          <Alert variant="info" isInline title="Double-click on the panel to create a Site" />
          <Divider />
        </StackItem>

        <StackItem isFilled>
          <Drawer isExpanded={!!sid}>
            <DrawerContent panelContent={panelContent}>
              <DrawerContentBody>
                <GraphComponent
                  ref={graphRef}
                  nodes={nodes}
                  edges={edges}
                  onClickCanvas={handleClickCanvas}
                  ContextMenuComponent={ContextMenuComponent}
                />
              </DrawerContentBody>
            </DrawerContent>
          </Drawer>
        </StackItem>
      </Stack>
    );
  }
);

export default Topology;

function convertSitesToNodes(sites: SiteResponse[]): GraphNode[] {
  return sites.map(({ id, name, metadata, deploymentstate }) => {
    const metaData = metadata ? JSON.parse(metadata) : {};
    const position = metaData?.position || {};

    const label = name;

    return {
      id,
      label,
      data: { deploymentstate },
      icon: { img: skupperIcon, width: 20, height: 20 },
      enableBadge1: true,
      notificationBgColor: DeploymentStatusColorHexMap[deploymentstate],
      ...position
    };
  });
}

function convertRouterLinksToEdges(links: LinkResponse[]): GraphEdge[] {
  return links.map(({ id, listeninginteriorsite, connectinginteriorsite, cost }) => ({
    id,
    source: connectinginteriorsite,
    target: listeninginteriorsite,
    label: cost.toString(),
    type: CUSTOM_ITEMS_NAMES.siteEdge
  }));
}
