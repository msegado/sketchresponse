import z from 'sketch/util/zdom';
import BasePlugin from './base-plugin';
import { injectStyleSheet, injectSVGDefs } from 'sketch/util/dom-style-helpers';
import deepExtend from 'deep-extend';
import {validate} from 'sketch/config-validator';

export const VERSION = '0.1';
export const GRADEABLE_VERSION = '0.1';

const DEFAULT_PARAMS = {
  label: 'Polyline',
  color: 'dimgray',
  dashStyle: 'solid',
  closed: false,
  fillColor: 'none',
  opacity: 1
}

export default class Polyline extends BasePlugin {
  constructor(params, app) {
    let plParams = BasePlugin.generateDefaultParams(DEFAULT_PARAMS, params);
    if (!app.debug || validate(params, 'polyline')) {
      deepExtend(plParams, params);
    }
    else {
      console.log('The polyline config has errors, using default values instead');
    }
    let iconSrc = plParams.closed ? './plugins/polyline/polyline-closed-icon.svg'
                                  : './plugins/polyline/polyline-open-icon.svg';
    // Add params that are specific to this plugin
    plParams.icon = {
      src: iconSrc,
      alt: 'Polyline tool',
      color: plParams.color
    };
    if (plParams.closed && plParams.fillColor !== 'none') {
        plParams.icon.fillColor = plParams.fillColor;
    }
    super(plParams, app);
    // Message listeners
    this.app.__messageBus.on('addPolyline', (id, index) => {this.addPolyline(id, index)});
    this.app.__messageBus.on('deletePolylines', () => {this.deletePolylines()});
    this.app.__messageBus.on('finalizeShapes', (id) => {this.drawEnd(id)});
  }

  getGradeable() {
    return this.state.map(spline => {
      if (spline.length > 0) {
        return {
          spline: spline.map(point => [point.x, point.y]),
          tag: spline[0].tag
        };
      }
    });
  }

  addPolyline(id, index) {
    if (this.id === id) {
      this.delIndices.push(index);
    }
  }

  deletePolylines() {
    if (this.delIndices.length !== 0) {
      this.delIndices.sort();
      for (let i = this.delIndices.length -1; i >= 0; i--) {
        this.state.splice(this.delIndices[i], 1);
      }
      this.delIndices.length = 0;
      this.render();
    }
  }

  // This will be called when clicking on the SVG canvas after having
  // selected the line segment shape
  initDraw(event) {
    let currentPosition = {
      x: event.clientX - this.params.left,
      y: event.clientY - this.params.top
    };
    // We already have at least one polyline defined, add new points to the last one
    if (this.state.length > 0) {
      // Only add tag to first point
      if (this.hasTag && this.state[this.state.length-1].length === 0) {
        currentPosition.tag = this.tag.value;
      }
      this.state[this.state.length-1].push(currentPosition);
    }
    // Create our first polyline
    else {
      // Only add tag to first point
      if (this.hasTag) {
        currentPosition.tag = this.tag.value;
      }
      this.state.push([currentPosition]);
    }
    this.app.addUndoPoint();
    this.render();
    event.stopPropagation();
    event.preventDefault();
  }

  drawEnd(id) {
    // To signal that a polyline has been completed, push an empty array
    if (id !== this.id && id !== 'undo' && id !== 'redo' &&
        this.state.length > 0 && this.state[this.state.length-1].length > 0) {
      this.state.push([]);
      this.app.addUndoPoint();
    }
    this.render();
  }

  polylineStrokeWidth(index) {
    return index === this.state.length-1 ? '3px' : '2px';
  }

  pointRadius(polylineIndex) {
    return this.state[polylineIndex].length === 1 ? 4 : 8;
  }

  pointOpacity(polylineIndex) {
    return this.state[polylineIndex].length === 1 ? '' : 0;
  }

  render() {
    z.render(this.el,
      z.each(this.state, (polyline, polylineIndex) =>
        // Draw visible polyline under invisible polyline
          z('path.visible-' + polylineIndex + '.polyline' + '.plugin-id-' + this.id, {
            d: polylinePathData(this.state[polylineIndex], this.params.closed),
            style: `
                stroke: ${this.params.color};
                stroke-width: ${this.polylineStrokeWidth(polylineIndex)};
                stroke-dasharray: ${this.computeDashArray(this.params.dashStyle, this.polylineStrokeWidth(polylineIndex))};
                fill: ${this.params.fillColor};
                opacity: ${this.params.opacity};
              `
          })

      ),
      z.each(this.state, (polyline, polylineIndex) =>
        // Draw invisible and selectable polyline under invisible points
        z('path.invisible-' + polylineIndex + this.readOnlyClass(), {
          d: polylinePathData(this.state[polylineIndex], this.params.closed),
          style: `
              stroke: ${this.params.color};
              stroke-width: 10px;
              fill: ${this.params.fillColor};
              opacity: 0;
            `,
          onmount: el => {
            this.app.registerElement({
              ownerID: this.params.id,
              element: el,
              initialBehavior: 'none',
              onDrag: ({dx, dy}) => {
                for (let pt of this.state[polylineIndex]) {
                  pt.x += dx;
                  pt.y += dy;
                }
                this.render();
              },
              inBoundsX: (dx) => {
                for (let pt of this.state[polylineIndex]) {
                  if (!this.inBoundsX(pt.x + dx)) {
                    return false;
                  }
                }
                return true;
              },
              inBoundsY: (dy) => {
                for (let pt of this.state[polylineIndex]) {
                  if (!this.inBoundsY(pt.y + dy)) {
                    return false;
                  }
                }
                return true;
              }
            });
          }
        })
      ),
      z.each(this.state, (polyline, polylineIndex) =>
        // Draw invisible (when length of polyline > 1) and selectable points
        z.each(polyline, (pt, ptIndex) =>
          z('circle.invisible-' + polylineIndex + this.readOnlyClass(), {
            cx: this.state[polylineIndex][ptIndex].x,
            cy: this.state[polylineIndex][ptIndex].y,
            r: this.pointRadius(polylineIndex),
            style: `
              fill: ${this.params.color};
              stroke-width: 0;
              opacity: ${this.pointOpacity(polylineIndex)};
            `,
            onmount: el => {
              this.app.registerElement({
                ownerID: this.params.id,
                element: el,
                initialBehavior: 'none',
                onDrag: ({dx, dy}) => {
                  this.state[polylineIndex][ptIndex].x += dx;
                  this.state[polylineIndex][ptIndex].y += dy;
                  this.render();
                },
                inBoundsX: (dx) => {
                  return this.inBoundsX(this.state[polylineIndex][ptIndex].x + dx);
                },
                inBoundsY: (dy) => {
                  return this.inBoundsY(this.state[polylineIndex][ptIndex].y + dy)
                },
              });
            }
          })
        )
      ),
      // Tags, regular or rendered by Katex
      z.each(this.state, (polyline, polylineIndex) =>
        z.if(this.hasTag && this.state[polylineIndex].length > 0 && this.state[polylineIndex][0].tag, () =>
          z(this.latex ? 'foreignObject.tag' : 'text.tag', {
            'text-anchor': (this.latex ? undefined : this.tag.align),
            x: this.state[polylineIndex][0].x + this.tag.xoffset,
            y: this.state[polylineIndex][0].y + this.tag.yoffset,
            style: this.getStyle(),
            onmount: el => {
              if (this.latex) {
                this.renderKatex(el, polylineIndex, 0);
              }
              if (!this.params.readonly) {
                this.addDoubleClickEventListener(el, polylineIndex, 0);
              }
            },
            onupdate: el => {
              if (this.latex) {
                this.renderKatex(el, polylineIndex, 0);
              }
            }
          }, this.latex ? '' : this.state[polylineIndex][0].tag)
        )
      )
    );
  }

  inBoundsX(x) {
    return x >= this.bounds.xmin && x <= this.bounds.xmax;
  }

  inBoundsY(y) {
    return y >= this.bounds.ymin && y <= this.bounds.ymax;
  }
}

function polylinePathData(points, closed) {
  var result;
  if (points.length < 2) return '';
  const coords = points.map(p => `${p.x},${p.y}`);
  result = `M${coords[0]} L${coords.splice(1).join(' L')}`;
  return closed ? result + ` L${coords[0]}` : result;
}
