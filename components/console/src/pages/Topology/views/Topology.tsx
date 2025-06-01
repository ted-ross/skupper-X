import { useEffect, useRef, useCallback, useState } from 'react';
import {
  Graph,
  GraphOptions,
  NodeEvent,
  EdgeEvent,
  IPointerEvent,
  Node,
  Edge,
  ExtensionCategory,
  register,
  CustomBehaviorOption
} from '@antv/g6';
import { ReactNode } from '@antv/g6-extension-react';
import { Stack, StackItem, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem, Button } from '@patternfly/react-core';
import { TopologyIcon, SearchPlusIcon, SearchMinusIcon } from '@patternfly/react-icons';

import EmptyData from '../../../core/components/EmptyData';
import TitleSection from '../../../core/components/TitleSection';
import labels from '../../../core/config/labels.json';
import MainContainer from '../../../layout/MainContainer';
import { useTopologyData } from '../hooks/useTopologyData';
import { transformTopologyData, isTopologyDataEmpty, TopologyGraphData } from '../Topology.utils';
import { hexColors } from '../../../config/colors';
import SiteNode from '../components/SiteNode';

// Container sizing configuration for React nodes
const SITE_NODE_CONFIG = {
  // Base dimensions (must match SiteNode component styles)
  COLLAPSED_WIDTH: 200,
  COLLAPSED_HEIGHT: 85,
  EXPANDED_WIDTH: 280,
  EXPANDED_HEIGHT: 140,

  // Container offsets for proper arrow positioning
  WIDTH_OFFSET: 0, // No width offset needed as card width fills container
  COLLAPSED_HEIGHT_OFFSET: 10, // Small offset for collapsed cards
  EXPANDED_HEIGHT_OFFSET: 95 // Larger offset for expanded cards to handle content variations
};

// Register custom elements
const registerTopologyElements = () => {
  register(ExtensionCategory.NODE, 'react-site-node', ReactNode);
};

// Graph behaviors
const behaviors: CustomBehaviorOption[] = [
  { key: 'drag-canvas', type: 'drag-canvas' },
  { key: 'zoom-canvas', type: 'zoom-canvas', enable: true },
  { key: 'drag-element', type: 'drag-element' },
  { key: 'drag-combo', type: 'drag-combo' },
  {
    key: 'click-select',
    type: 'click-select',
    enable: ({ targetType }: IPointerEvent) => targetType === 'node' || targetType === 'edge' || targetType === 'combo'
  },
  {
    key: 'hover-activate',
    type: 'hover-activate',
    enable: ({ targetType }: IPointerEvent) => targetType === 'node' || targetType === 'combo'
  }
];

const CONTAINER_ID = 'topology-graph-container';

const Topology = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [isGraphLoaded, setIsGraphLoaded] = useState(false);

  // Fetch topology data
  const { data: topologyData, isLoading, error } = useTopologyData();

  // Log topology data for debugging
  useEffect(() => {
    console.log('Topology data changed:', { topologyData, isLoading, error });
  }, [topologyData, isLoading, error]);

  // Initialize graph
  const initializeGraph = useCallback((container: HTMLDivElement, data: TopologyGraphData) => {
    if (graphRef.current) {
      return graphRef.current;
    }

    // Clear any existing canvas elements in the container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Register custom elements
    registerTopologyElements();

    const options: GraphOptions = {
      container,
      width: container.offsetWidth,
      height: container.offsetHeight,
      background: '#f8f9fa',
      autoResize: false,
      animation: false,
      padding: 20,
      behaviors,
      transforms: [
        {
          type: 'process-parallel-edges'
        }
      ],
      layout: {
        type: 'antv-dagre',
        rankdir: 'TB', // Top to Bottom direction
        ranksep: 90, // Vertical separation between ranks
        nodesep: 60, // Horizontal separation between nodes
        sortByCombo: true, // Group nodes by combo for better organization
        // Additional dagre settings for better layout
        align: 'UL', // Upper Left alignment
        nodeSize: [120, 80], // Node dimensions for layout calculation
        controlPoints: true // Enable control points for edges
      },
      node: {
        type: 'react-site-node', // Only site nodes now, no backbone nodes
        style: {
          size: (d: any) => {
            // For React nodes, size depends on expanded state
            const expanded = d.data?.expanded;

            // Calculate container dimensions based on SiteNode card dimensions + offsets
            const baseWidth = expanded ? SITE_NODE_CONFIG.EXPANDED_WIDTH : SITE_NODE_CONFIG.COLLAPSED_WIDTH;
            const baseHeight = expanded ? SITE_NODE_CONFIG.EXPANDED_HEIGHT : SITE_NODE_CONFIG.COLLAPSED_HEIGHT;
            const heightOffset = expanded
              ? SITE_NODE_CONFIG.EXPANDED_HEIGHT_OFFSET
              : SITE_NODE_CONFIG.COLLAPSED_HEIGHT_OFFSET;

            return [baseWidth + SITE_NODE_CONFIG.WIDTH_OFFSET, baseHeight + heightOffset];
          },
          // Custom anchor points for React nodes to align arrows with Card content
          anchorPoints: (d: any) => {
            const expanded = d.data?.expanded;

            if (expanded) {
              // For expanded cards (280x140), use standard anchor points as card fills container
              return [
                [0, 0.5], // left center
                [1, 0.5], // right center
                [0.5, 0.1], // top center (slightly inset from top)
                [0.5, 0.9], // bottom center (slightly inset from bottom)
                [0.05, 0.1], // top left (slightly inset)
                [0.95, 0.1], // top right (slightly inset)
                [0.05, 0.9], // bottom left (slightly inset)
                [0.95, 0.9] // bottom right (slightly inset)
              ];
            } else {
              // Dynamic calculation for collapsed cards based on PatternFly Card structure
              // Use the same configuration as the container sizing
              const containerHeight = SITE_NODE_CONFIG.COLLAPSED_HEIGHT + SITE_NODE_CONFIG.COLLAPSED_HEIGHT_OFFSET;
              const cardHeaderHeight = 32; // PatternFly Card header height
              const cardBodyHeight = 53; // PatternFly Card body height for collapsed state

              // Calculate anchor points to avoid card content overlap
              const headerCenter = cardHeaderHeight / containerHeight; // ~0.38
              const bodyCenter = (cardHeaderHeight + cardBodyHeight / 2) / containerHeight; // ~0.69
              const bottomBorder = (containerHeight - 5) / containerHeight; // ~0.94 (leave 5px margin)
              const topBorder = 5 / containerHeight; // ~0.06 (leave 5px margin)
              const sideInset = 0.05; // 5% horizontal inset for cleaner connections

              return [
                [sideInset, 0.5], // left center (middle of card)
                [1 - sideInset, 0.5], // right center (middle of card)
                [0.5, topBorder], // top center (just below card border)
                [0.5, bottomBorder], // bottom center (just above card border)
                [sideInset, headerCenter], // top left (in header area)
                [1 - sideInset, headerCenter], // top right (in header area)
                [sideInset, bodyCenter], // bottom left (in body area)
                [1 - sideInset, bodyCenter] // bottom right (in body area)
              ];
            }
          },
          component: (d: any) => {
            return <SiteNode data={{ ...d.data, graph: graphRef.current }} />;
          },
          // Add badges for access points
          badges: (d: any) => {
            const badges = d.data?.accessPointBadges;
            if (!badges || badges.length === 0) return [];

            return badges.map((badge: any, index: number) => {
              // Position badges starting from left, then moving clockwise
              const positions = [
                'left-bottom',
                'bottom',
                'right-bottom',
                'left',
                'left-top',
                'right-top',
                'right',
                'top'
              ];
              const placement = positions[index % positions.length];

              return {
                text: `${badge.count}`,
                placement,
                fontSize: 8,
                fill: badge.count > 1 ? hexColors.White : badge.color,
                backgroundFill: badge.color,
                padding: [1, 5],
                borderRadius: 10,
                textAlign: 'center',
                textBaseline: 'middle'
              };
            });
          }
        }
      },
      combo: {
        type: 'rect', // Use rectangle combos for backbone containers
        style: {
          fill: 'rgba(0, 102, 204, 0.1)', // Light blue background
          stroke: '#0066cc', // Blue border
          strokeWidth: 2,
          radius: 8,
          labelText: (d: any) => d.label || d.id,
          labelFill: '#0066cc',
          labelFontSize: 16,
          labelFontWeight: 'bold',
          labelPosition: 'top',
          labelBackground: true,
          labelBackgroundFill: 'rgba(255, 255, 255, 0.9)',
          labelBackgroundStroke: '#0066cc',
          labelBackgroundStrokeWidth: 1,
          labelBackgroundRadius: 4,
          labelPadding: [4, 8],
          // Minimum size to accommodate internal nodes properly
          minSize: [400, 250],
          // Increased padding inside combo to prevent nodes from touching borders
          padding: [60, 30, 60, 30] // top, right, bottom, left
        }
      },
      edge: {
        type: (d: any) => {
          // Use quadratic curves for link edges to better distribute arrows
          return d.data?.edgeType === 'link' ? 'quadratic' : 'line';
        },
        style: {
          stroke: (d: any) => {
            switch (d.data?.edgeType) {
              case 'link':
                // Use different colors for different directions
                if (d.data?.linkDirection === 'forward') {
                  return '#fa8c16'; // Orange for forward direction
                } else if (d.data?.linkDirection === 'reverse') {
                  return '#52c41a'; // Green for reverse direction
                } else {
                  return '#fa8c16'; // Default orange for single direction
                }
              default:
                return '#d9d9d9';
            }
          },
          strokeWidth: (d: any) => {
            switch (d.data?.edgeType) {
              case 'link':
                return 2;
              default:
                return 1;
            }
          },
          strokeDasharray: (d: any) => {
            return d.data?.edgeType === 'link' ? [5, 5] : undefined;
          },
          endArrow: (d: any) => {
            return d.data?.edgeType === 'link';
          },
          endArrowFill: (d: any) => {
            if (d.data?.edgeType === 'link') {
              // Match arrow color with stroke color
              if (d.data?.linkDirection === 'forward') {
                return '#fa8c16'; // Orange for forward direction
              } else if (d.data?.linkDirection === 'reverse') {
                return '#52c41a'; // Green for reverse direction
              } else {
                return '#fa8c16'; // Default orange for single direction
              }
            }
            return undefined;
          },
          endArrowSize: (d: any) => {
            return d.data?.edgeType === 'link' ? 8 : undefined;
          },
          // Rimuovo endArrowOffset per ora, implementerò una soluzione più sofisticata
          labelText: (d: any) => {
            if (d.data?.edgeType === 'link') {
              return d.data?.label || '';
            }
            return d.data?.label || '';
          },
          labelFill: '#333',
          labelFontSize: 12,
          labelFontWeight: 'bold',
          labelBackground: true,
          labelBackgroundFill: 'rgba(255, 255, 255, 0.9)',
          labelBackgroundStroke: '#ccc',
          labelBackgroundRadius: 4,
          labelPadding: [3, 8],
          labelPlacement: 'center'
        }
      },
      data
    };

    const graph = new Graph(options);

    // Add event listeners
    graph.on<IPointerEvent<Node>>(NodeEvent.CLICK, ({ target }) => {
      console.log('Node clicked:', target.id);
    });

    graph.on<IPointerEvent<Edge>>(EdgeEvent.CLICK, ({ target }) => {
      console.log('Edge clicked:', target.id);
    });

    // Add combo event listeners
    graph.on('combo:click', (event: any) => {
      console.log('Combo clicked:', event.target?.id || event.itemId);
    });

    return graph;
  }, []);

  // Update graph data
  const updateGraphData = useCallback((data: TopologyGraphData) => {
    if (!graphRef.current) {
      return;
    }

    console.log('Updating graph with data:', data);

    try {
      graphRef.current.setData(data);
      graphRef.current.render().then(() => {
        if (graphRef.current && data.nodes.length > 0) {
          graphRef.current.fitView();
        }
      });
    } catch (error) {
      console.error('Error updating graph data:', error);
    }
  }, []);

  // Initialize graph when container is ready
  useEffect(() => {
    if (!containerRef.current || isLoading || error || !topologyData || isTopologyDataEmpty(topologyData)) {
      return undefined;
    }

    const transformedData = transformTopologyData(topologyData);

    if (!graphRef.current && transformedData.nodes.length > 0) {
      console.log('Initializing graph with data:', transformedData);

      const graph = initializeGraph(containerRef.current, transformedData);

      graph
        .render()
        .then(() => {
          graph.fitView();
          graphRef.current = graph;
          setIsGraphLoaded(true);
          console.log('Graph initialized successfully');
        })
        .catch((error) => {
          console.error('Error rendering graph:', error);
        });
    }

    return undefined;
  }, [topologyData, isLoading, error, initializeGraph]);

  // Update data when topology changes
  useEffect(() => {
    if (isGraphLoaded && topologyData && !isTopologyDataEmpty(topologyData)) {
      const transformedData = transformTopologyData(topologyData);
      updateGraphData(transformedData);
    }
    return undefined;
  }, [topologyData, isGraphLoaded, updateGraphData]);

  // Handle container resize with debouncing
  useEffect(() => {
    if (graphRef.current && containerRef.current) {
      let resizeTimeout: number;

      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }

        resizeTimeout = window.setTimeout(() => {
          if (containerRef.current && graphRef.current) {
            try {
              const { offsetWidth, offsetHeight } = containerRef.current;
              if (offsetWidth > 0 && offsetHeight > 0) {
                graphRef.current.resize(offsetWidth, offsetHeight);
              }
            } catch (error) {
              console.warn('Error during graph resize:', error);
            }
          }
        }, 100);
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        resizeObserver.disconnect();
      };
    }
    return undefined;
  }, [isGraphLoaded]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch (error) {
          console.warn('Error destroying graph:', error);
        }
        graphRef.current = null;
      }

      if (containerRef.current) {
        const canvasElements = containerRef.current.querySelectorAll('canvas');
        canvasElements.forEach((canvas) => canvas.remove());
      }
    };
  }, []);

  const handleFitView = () => {
    if (graphRef.current) {
      graphRef.current.fitView();
    }
  };

  const handleCenterView = () => {
    if (graphRef.current) {
      graphRef.current.fitCenter();
    }
  };

  const handleResetLayout = () => {
    if (graphRef.current) {
      graphRef.current.layout();
    }
  };

  const handleZoomIn = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.getZoom();
      graphRef.current.zoomTo(currentZoom * 1.2);
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      const currentZoom = graphRef.current.getZoom();
      graphRef.current.zoomTo(currentZoom * 0.8);
    }
  };

  return (
    <MainContainer
      title={<TitleSection title={labels.navigation.networkTopology} headingLevel="h1" />}
      mainContentChildren={
        <Stack hasGutter style={{ height: '100%' }}>
          <StackItem>
            <Toolbar>
              <ToolbarContent>
                <ToolbarGroup align={{ default: 'alignStart' }}>
                  <ToolbarItem>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                      <span style={{ fontWeight: 'bold' }}>Legend:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{
                            width: '20px',
                            height: '12px',
                            backgroundColor: 'rgba(0, 102, 204, 0.1)',
                            border: '2px solid #0066cc',
                            borderRadius: '4px'
                          }}
                        ></div>
                        <span>Backbone Container</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{
                            width: '20px',
                            height: '12px',
                            backgroundColor: '#f8f9fa',
                            border: '1px solid #ccc',
                            borderRadius: '2px',
                            fontSize: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#333'
                          }}
                        >
                          Site
                        </div>
                        <span>Site (within backbone)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '16px', height: '2px', backgroundColor: '#fa8c16' }}></div>
                        <span>Peer link (forward)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '16px', height: '2px', backgroundColor: '#52c41a' }}></div>
                        <span>Peer link (reverse)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{ width: '12px', height: '12px', backgroundColor: '#1890ff', borderRadius: '50%' }}
                        ></div>
                        <span>Claim AP</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{ width: '12px', height: '12px', backgroundColor: '#fa8c16', borderRadius: '50%' }}
                        ></div>
                        <span>Peer AP</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{ width: '12px', height: '12px', backgroundColor: '#13c2c2', borderRadius: '50%' }}
                        ></div>
                        <span>Member AP</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div
                          style={{ width: '12px', height: '12px', backgroundColor: '#722ed1', borderRadius: '50%' }}
                        ></div>
                        <span>Manage AP</span>
                      </div>
                    </div>
                  </ToolbarItem>
                </ToolbarGroup>
                <ToolbarGroup align={{ default: 'alignEnd' }}>
                  <ToolbarItem>
                    <Button
                      variant="secondary"
                      onClick={handleFitView}
                      isDisabled={isLoading || !!error || !topologyData || !isGraphLoaded}
                    >
                      {labels.buttons.fitView}
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button
                      variant="secondary"
                      onClick={handleCenterView}
                      isDisabled={isLoading || !!error || !topologyData || !isGraphLoaded}
                    >
                      {labels.buttons.center}
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button
                      variant="secondary"
                      onClick={handleResetLayout}
                      isDisabled={isLoading || !!error || !topologyData || !isGraphLoaded}
                    >
                      {labels.buttons.resetLayout}
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button
                      variant="secondary"
                      onClick={handleZoomIn}
                      isDisabled={isLoading || !!error || !topologyData || !isGraphLoaded}
                      icon={<SearchPlusIcon />}
                    >
                      Zoom In
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button
                      variant="secondary"
                      onClick={handleZoomOut}
                      isDisabled={isLoading || !!error || !topologyData || !isGraphLoaded}
                      icon={<SearchMinusIcon />}
                    >
                      Zoom Out
                    </Button>
                  </ToolbarItem>
                </ToolbarGroup>
              </ToolbarContent>
            </Toolbar>
          </StackItem>

          <StackItem isFilled>
            {isLoading ? (
              <EmptyData
                message={labels.emptyStates.loadingTopology}
                description={labels.emptyStates.loadingTopology}
                icon={TopologyIcon}
              />
            ) : error ? (
              <EmptyData
                message={labels.errors.errorLoadingTopology}
                description={labels.errors.errorLoadingTopology}
                icon={TopologyIcon}
              />
            ) : !topologyData || isTopologyDataEmpty(topologyData) ? (
              <EmptyData
                message={labels.emptyStates.noTopologyData}
                description={labels.emptyStates.noTopologyDataDescription}
                icon={TopologyIcon}
              />
            ) : (
              <div
                id={CONTAINER_ID}
                ref={containerRef}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '600px'
                }}
              />
            )}
          </StackItem>
        </Stack>
      }
    />
  );
};

export default Topology;
