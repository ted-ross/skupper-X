import { registerEdge, registerCombo, IGroup, registerNode } from '@antv/g6';

import {
  BADGE_STYLE,
  CUSTOM_ITEMS_NAMES,
  EDGE_COLOR_DEFAULT,
  EDGE_COLOR_DEFAULT_TEXT,
  NODE_SIZE,
  EDGE_COLOR_HOVER_DEFAULT,
  EDGE_COLOR_ENDPOINT_SITE_CONNECTION_DEFAULT,
  DEFAULT_EDGE_CONFIG
} from '../Graph.constants';
import { ComboWithCustomLabel, NodeWithBadgesProps } from '../Graph.interfaces';

export function registerDataEdge() {
  registerEdge(
    CUSTOM_ITEMS_NAMES.animatedDashEdge,
    {
      afterDraw(_, group) {
        if (group) {
          const shape = group.get('children')[0];
          const { x, y } = shape.getPoint(0);
          const circle = group.addShape('circle', {
            attrs: {
              x,
              y,
              fill: EDGE_COLOR_HOVER_DEFAULT,
              r: 4
            },
            name: 'circle-shape'
          });

          circle.hide();
        }
      },

      setState(name, value, item) {
        if (item) {
          const group = item.getContainer();
          const shape = group.get('children')[0];
          const circle = group.find((element) => element.get('name') === 'circle-shape');

          if ((name === 'hover' || name === 'active') && value) {
            circle.show();

            circle.animate(
              (ratio: number) => {
                const tmpPoint = shape.getPoint(ratio);

                return { x: tmpPoint.x, y: tmpPoint.y };
              },
              {
                repeat: true,
                duration: 3000
              }
            );
          } else {
            circle.stopAnimate(true);
            circle.hide();
          }
        }
      }
    },
    'quadratic'
  );
}

export function registerSiteLinkEdge() {
  // Draw a blue line dash when hover an edge
  const lineDash = [4, 4];

  registerEdge(CUSTOM_ITEMS_NAMES.siteEdge, {
    draw(cfg, group) {
      const { startPoint, endPoint } = cfg;

      group.addShape('path', {
        attrs: {
          path: [
            ['M', startPoint?.x, startPoint?.y],
            ['L', endPoint?.x, endPoint?.y]
          ],
          stroke: 'transparent',
          lineWidth: 15,
          cursor: 'pointer'
        },
        name: 'path-shape'
      });

      const keyShape = group.addShape('path', {
        attrs: {
          path: [
            ['M', startPoint?.x, startPoint?.y],
            ['L', endPoint?.x, endPoint?.y]
          ],
          stroke: EDGE_COLOR_DEFAULT,
          lineWidth: 0.5,
          lineDash,
          cursor: 'pointer'
        },
        name: 'path-dash-shape'
      });

      if (cfg.label) {
        group.addShape('text', {
          attrs: {
            text: cfg.label,
            fill: EDGE_COLOR_DEFAULT_TEXT,
            textAlign: 'center',
            textBaseline: 'middle',
            x: (startPoint?.x || 2) / 2 + (endPoint?.x || 2) / 2,
            y: (startPoint?.y || 2) / 2 + (endPoint?.y || 2) / 2,
            ...DEFAULT_EDGE_CONFIG.labelCfg?.style,
            ...cfg.labelCfg?.style
          },
          name: 'center-text-shape'
        });
      }

      return keyShape;
    },
    afterDraw(_, group) {
      if (group) {
        const shape = group.get('children')[0];
        const quatile = shape.getPoint(0.97);

        group.addShape('circle', {
          attrs: {
            r: 4,
            fill: EDGE_COLOR_ENDPOINT_SITE_CONNECTION_DEFAULT,
            x: quatile.x,
            y: quatile.y
          }
        });
      }
    }
  });
}

export function registerComboWithCustomLabel() {
  const textContainerKey = 'combo-label-shape';

  registerCombo(
    CUSTOM_ITEMS_NAMES.comboWithCustomLabel,
    {
      afterDraw(cfg: ComboWithCustomLabel | undefined, group) {
        if (group?.get('children')[1]) {
          const { width, height } = group.get('children')[1].getBBox(); // combo label

          // creates a background container for the combo label
          const textContainer = group.addShape('rect', {
            attrs: cfg?.labelBgCfg || {},
            name: textContainerKey
          });

          const padding = cfg?.labelBgCfg?.padding || [0, 0];
          textContainer.attr({
            width: width + padding[0],
            height: height + padding[1]
          });

          textContainer.toBack();
        }
      },
      afterUpdate(cfg: ComboWithCustomLabel | undefined, combo) {
        if (combo?.get('group')?.get('children')[2]) {
          const group = combo.get('group') as IGroup;
          const { x, y } = group.get('children')[2].getBBox(); // combo label
          const textContainer = group.find((element) => element.get('name') === textContainerKey);

          const padding = cfg?.labelBgCfg?.padding || [0, 0];
          textContainer.attr({
            x: x - padding[0] / 2,
            y: y - padding[1] / 2
          });
        }
      }
    },
    'rect'
  );
}

export function registerNodeWithBadges() {
  const { containerBg, containerBorderColor, textColor, textFontSize } = BADGE_STYLE;
  const r = NODE_SIZE / 5;
  const angleBadge1 = 180;
  const x = r * Math.cos(angleBadge1) - r;
  const y = r * Math.sin(angleBadge1) - r;

  const textContainerKey = 'node-label-shape';
  const contextMenuKey = 'node-cx-shape';

  registerNode(
    CUSTOM_ITEMS_NAMES.nodeWithBadges,
    {
      afterDraw(cfg: NodeWithBadgesProps | undefined, group) {
        if (group?.get('children')[3]) {
          const { width, height, x: xl, y: yl } = group.get('children')[3].getBBox(); // combo label

          // creates a background container for the combo label
          const bgStyle = cfg?.labelCfg?.style?.background || {};
          const padding = (bgStyle?.padding as number[]) || [0, 0];

          const textContainer = group.addShape('rect', {
            attrs: {
              ...bgStyle,
              width: width + padding[0] + 18,
              height: height + padding[1] + 2,
              x: xl - padding[0] * 2,
              y: yl - padding[1] / 2 - 1,
              lineWidth: 0.5,
              fill: 'white'
            },
            name: textContainerKey
          });

          group.addShape('line', {
            attrs: {
              x1: xl + width + padding[0],
              y1: yl - padding[1] / 2 - 1,
              x2: xl + width + padding[0],
              y2: yl + height + padding[1] / 2 + 1,
              stroke: bgStyle.stroke,
              lineWidth: 0.5
            }
          });

          group.addShape('circle', {
            attrs: {
              x: xl + width + 9,
              y: yl + height / 4 - 1,
              r: 1,
              fill: '#000'
            }
          });

          group.addShape('circle', {
            attrs: {
              x: xl + width + 9,
              y: yl + height / 2,
              r: 1,
              fill: '#000'
            }
          });

          group.addShape('circle', {
            attrs: {
              x: xl + width + 9,
              y: yl + (3 * height) / 4 + 1,
              r: 1,
              fill: '#000'
            }
          });

          group.addShape('rect', {
            attrs: {
              ...bgStyle,
              cursor: 'pointer',
              width: 14,
              height: height + padding[1],
              x: xl + width + padding[0] - 2,
              y: yl - padding[1] / 2 - 1
            },
            name: contextMenuKey
          });

          textContainer.toBack();
        }

        if (cfg?.enableBadge1 && group) {
          group.addShape('circle', {
            attrs: {
              x,
              y,
              r,
              stroke: containerBorderColor,
              fill: cfg.notificationBgColor || containerBg
            },
            name: `${CUSTOM_ITEMS_NAMES.nodeWithBadges}-notification-container`
          });

          group.addShape('text', {
            attrs: {
              x,
              y,
              textAlign: 'center',
              textBaseline: 'middle',
              text: cfg.notificationValue,
              fill: cfg.notificationColor || textColor,

              fontSize: cfg.notificationFontSize || textFontSize
            }
          });
        }
      }
    },
    'circle'
  );
}
