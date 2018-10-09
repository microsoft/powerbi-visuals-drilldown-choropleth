/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    import LegendModule = powerbi.extensibility.utils.chart.legend;
    import ILegend = powerbi.extensibility.utils.chart.legend.ILegend;
    import LegendData = powerbi.extensibility.utils.chart.legend.LegendData;
    import LegendDataModule = powerbi.extensibility.utils.chart.legend.data;
    import LegendIcon = powerbi.extensibility.utils.chart.legend.LegendIcon;
    import legendPosition = powerbi.extensibility.utils.chart.legend.position;
    import createLegend = powerbi.extensibility.utils.chart.legend.createLegend;
    import LegendPosition = powerbi.extensibility.utils.chart.legend.LegendPosition;

    // powerbi.extensibility.utils.formatting
    import ValueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;

    /**
     * Interface for viewmodel.
     *
     * @interface
     * @property {CategoryDataPoint[]} dataPoints - Set of data points the visual will render.
     */
    interface ViewModel {
        dataPoints: CategoryDataPoint[];  //Check Code: Find way to speficy it as an Array
    };

    /**
     * Interface for data points.
     *
     * @interface
     * @property {string} category          - Corresponding category of data value.
     * @property {ISelectionId} selectionId - Id assigned to data point for cross filtering
     *                                        and visual interaction.
     */
    interface CategoryDataPoint {
        category: string;
        value: number;
        selectionId: ISelectionId;
        hashighlight: boolean;
        legend_value: any;
        legend_color: any
        rowdata: any;
        formatted_value: any;
    };

    function contract(path, options, m) {
        let x, y, k;
        let centroid = null;
        x = options.width / 2;
        y = options.height / 2;
        k = 1;

        m.transition()
            .duration(450)
            .attr('transform', "translate(" + x + "," + y + ")scale(" + k + ")translate(" + -x + "," + -y + ")")
    }

    function getformattedValues(dataView: any, row: any) {
        let formatted_values = []
        let valueFormatter: IValueFormatter;

        _.each(row, function(v, i){
            let dmeta = dataView.metadata.columns[i]
            valueFormatter = ValueFormatter.create({
                format: ValueFormatter.getFormatStringByColumn(dmeta),
            });
            formatted_values.push(valueFormatter.format(v))
        })

        return formatted_values
    }

    /**
     * Function that checks if data is ready to be used by the visual.
     *
     * @function
     * @param {VisualUpdateOptions} options - Contains references to the size of the container
     *                                        and the dataView which contains all the data
     *                                        the visual had queried.
     */
    function isDataReady(options: VisualUpdateOptions) {
        if (!options
            || !options.dataViews
            || !options.dataViews[0]
            || !options.dataViews[0].categorical
            || !options.dataViews[0].categorical.categories
            || !options.dataViews[0].categorical.categories[0].source) {
            return false;
        }

        return true;
    }

    export class Visual implements IVisual {
        private target: HTMLElement;
        private updateCount: number;
        private margin = { top: 20, right: 20, bottom: 40, left: 20 };
        private svg: d3.Selection<SVGElement>;
        private levelStack;
        private projection;
        private path;
        private viewModel: ViewModel;
        private selectionManager: ISelectionManager;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private host;
        private settings;

        private data;
        private legend_data;
        private legend: ILegend;

        private static clicked;
        private static previous_clicked;
        private static previous_transform;
        private current_Event;
        private static cat_objects = [];
        private static previous_level;

        private layout;
        private rect;

        private captions;

        private renderLegend(): void {
            // Force update for title text
            let legendObject = _.clone(this.settings.legend);
            legendObject.labelColor = <any>{ solid: { color: legendObject.labelColor } };
            LegendDataModule.update(this.legend_data, <any>legendObject);
            let position: string = legendPosition[this.settings.legend.position] as string;
            this.legend.changeOrientation(LegendPosition[position]);
            this.legend.drawLegend(this.legend_data, this.layout);
            LegendModule.positionChartArea(this.svg, this.legend);
        }

        /* Function to zoom on selected geography */
        private expand(path, cur_border, options, m, cur_level, zoom, settings, cur_Event) {

            var bounds = path.bounds(cur_border),
                dx = bounds[1][0] - bounds[0][0],
                dy = bounds[1][1] - bounds[0][1],
                _x = (bounds[0][0] + bounds[1][0]) / 2,
                _y = (bounds[0][1] + bounds[1][1]) / 2,
                scale = Math.max(1, Math.min(20, 0.9 / Math.max(dx / options.width, dy / options.height))),
                // scale = .9 / Math.max(dx / options.viewport.width, dy / options.viewport.height),
                translate = [options.width / 2 - scale * _x, options.height / 2 - scale * _y];
            if (settings.zoomsettings.manualzoom_enable) {

                if (cur_Event === 'drillup' && Visual.previous_transform) // for click zoom to work
                    m.attr('transform', Visual.previous_transform)

                m.transition()
                    .duration(750)
                    .attr('transform', 'translate(' + translate + ')scale(' + scale + ')')
                    .call(zoom.translate(translate).scale(scale).event);
                Visual.previous_transform = "translate(" + translate + ")scale(" + scale + ")"
            } else {
                if (cur_Event === 'drillup' && Visual.previous_transform)
                    m.attr('transform', Visual.previous_transform)

                m.transition()
                    .duration(750)
                    .attr("transform", "translate(" + translate + ")scale(" + scale + ")");

                Visual.previous_transform = "translate(" + translate + ")scale(" + scale + ")"
            }
        }

        private visualTransform(options: VisualUpdateOptions, host: IVisualHost, cur_clicked) {
            let dataViews = options.dataViews;
            let categorical = dataViews[0].categorical;
            let haslegend = false
            let tabledata = options.dataViews[0].table.rows
            let categories = []

            categorical.categories.forEach(function (category) {
                categories.push(category)
            });

            let category_length = categories.length - 1
            let geography = cur_clicked;
            if (category_length > 0) {
                geography = categories[category_length - 1].values[0]
            }

            let values = categorical.values[0]

            let legendData: LegendData = {
                fontSize: 10,
                dataPoints: [],
                title: 'Legend'
            };

            let legend_array = options.dataViews[0].metadata.columns.map(c => c.roles['Legend'])
            if (legend_array.indexOf(true) > -1) {
                haslegend = true
            }

            let legend_index = legend_array.indexOf(true)
            let _ = (<any>window)._
            let colorPalette: IColorPalette = host.colorPalette;
            let ldata = []
            let legend_data = null, temp_legend
            legend_data = options.dataViews[0].table.rows.map(c => c[legend_index])
            if (haslegend) {
                legend_data = options.dataViews[0].table.rows.map(c => c[legend_index])
                temp_legend = legend_data
                legend_data = _.uniq(legend_data)
                for (let i = 0; i < legend_data.length; i++) {
                    if (categories[0].objects) {
                        if (categories[0].objects[i]) {
                            Visual.cat_objects[i] = categories[0].objects[i]
                        }
                    }
                }
                legend_data.forEach(function (i, d) {
                    let defaultColor: Fill = {
                        solid: {
                            color: colorPalette.getColor(d + '').value
                        }
                    }
                    ldata.push({
                        label: i,
                        color: getCategoricalObjectValue<Fill>(categories[0], d, 'ordinalcolors', 'datacolor', defaultColor).solid.color,
                        identity: host.createSelectionIdBuilder()
                            .withCategory(categories[0], d)
                            .createSelectionId(),
                        icon: LegendIcon.Box,
                        selected: false,
                    })
                })
            }

            legendData.dataPoints = ldata;
            let category = categorical.categories[0];
            let maxvalue = +values.maxLocal
            let minvalue = +values.minLocal
            let centervalue = (maxvalue + minvalue) / 2
            let categoryDataPoints: CategoryDataPoint[] = [];
            let objects = dataViews[0].metadata.objects;
            let checkhighlight = true
            let highlightvalue = categorical.values[0].highlights;

            for (let i = 0, len = Math.max(categories[category_length].values.length, values.values.length); i < len; i++) {
                if (highlightvalue != undefined) {
                    checkhighlight = highlightvalue[i] !== null ? true : false;
                }

                let legend = ldata.length !== 0 ? ldata.filter(ld => ld.label === temp_legend[i]) : null
                categoryDataPoints.push({
                    category: categories[category_length].values[i] + '',
                    value: +values.values[i],
                    selectionId: host.createSelectionIdBuilder()
                        .withCategory(categories[0], i)
                        .createSelectionId(),
                    hashighlight: checkhighlight,
                    legend_value: legend != null ? legend[0].value : null,
                    legend_color: legend != null ? legend[0].color : null,
                    rowdata: tabledata[i],
                    formatted_value: getformattedValues(dataViews[0], tabledata[i])
                });
            }

            let settings = {
                mincolor: {
                    solid: {
                        color: 'red'
                    }
                },
                maxcolor: {
                    solid: {
                        color: 'green'
                    }
                },
                centercolor: {
                    solid: {
                        color: 'yellow'
                    }
                },
                strokecolor: {
                    solid: {
                        color: 'black'
                    }
                },
                nodatacolor: {
                    solid: {
                        color: 'white'
                    }
                },
                legend_color: {
                    solid: {
                        color: "#666666"
                    }
                }
            };

            let defaultprojection = 'Mercator'
            let projection = getValue<string>(objects, 'countryselector', 'projection', defaultprojection)

            let zoomsettings = {
                autozoom_enable: getValue<boolean>(objects, 'zoomselector', 'Autozoom', false),
                selectionzoom_enable: getValue<boolean>(objects, 'zoomselector', 'Selectionzoom', true),
                manualzoom_enable: getValue<boolean>(objects, 'zoomselector', 'Manualzoom', false)

            }
            let legend = {
                show: getValue<boolean>(objects, 'legendproperties', 'show', true),
                showTitle: getValue<boolean>(objects, 'legendproperties', 'title', true),
                labelColor: getValue<Fill>(objects, 'legendproperties', 'color', settings.legend_color)['solid']['color'],
                position: getValue<string>(objects, 'legendproperties', 'position', 'top'),
                fontSize: getValue<number>(objects, 'legendproperties', 'fontsize', 10)
            }

            let custom_level0 = getValue<string>(objects, 'countryselector', 'level0', null),
                custom_level1 = getValue<string>(objects, 'countryselector', 'level1', null),
                custom_level2 = getValue<string>(objects, 'countryselector', 'level2', null)

            return {
                dataPoints: categoryDataPoints,
                legenddata: legendData,
                settings: {
                    hashighlights: highlightvalue,
                    haslegend: haslegend,
                    min_color: getValue<Fill>(objects, 'categorycolorselector', 'mincolor', settings.mincolor)['solid']['color'],
                    max_color: getValue<Fill>(objects, 'categorycolorselector', 'maxcolor', settings.maxcolor)['solid']['color'],
                    center_color: getValue<Fill>(objects, 'categorycolorselector', 'centercolor', settings.centercolor)['solid']['color'],
                    min_value: getValue<number>(objects, 'categorycolorselector', 'minvalue', minvalue),
                    center_value: getValue<number>(objects, 'categorycolorselector', 'centervalue', centervalue),
                    max_value: getValue<number>(objects, 'categorycolorselector', 'maxvalue', maxvalue),
                    projection: projection,
                    custom_level0: custom_level0,
                    custom_level1: custom_level1,
                    custom_level2: custom_level2,
                    id0: getValue<string>(objects, 'countryselector', 'id0', null),
                    id1: getValue<string>(objects, 'countryselector', 'id1', null),
                    id2: getValue<string>(objects, 'countryselector', 'id2', null),
                    no_color: getValue<Fill>(objects, 'defaultSelector', 'nocolor', settings.nodatacolor)['solid']['color'],
                    stroke_width: getValue<number>(objects, 'defaultSelector', 'width', 1),
                    stroke_color: getValue<Fill>(objects, 'defaultSelector', 'strokecolor', settings.strokecolor)['solid']['color'],
                    geography_clicked: geography,
                    zoomsettings: zoomsettings,
                    legend: legend,
                    legend_show: getValue<boolean>(objects, 'ordinalcolors', 'legend', true)
                }
            };
        }

        private drawmap(svg, m, projection, path, options, geography, cur_level, selectionManager, viewModel, allowInteractions, Visual, tooltipServiceWrapper, zoom) {
            /* Parameter reference:
            * m: group where you draw map
            * path: path function draws map
            * options: gets viewport height and width
            * geography: shape you have clicked | default: all first level
            */

            // External JS libraries global variable.
            let tjson = (<any>window).topojson
            let _ = (<any>window)._
            // let G = (<any>window).G
            var data = viewModel.dataPoints;
            let settings = viewModel.settings
            let level_classes = { 0: 'level_0', 1: 'level_1', 2: 'level_2' }
            let cur_border, topojson, t;

            let clevel0 = settings.custom_level0 != '' ? settings.custom_level0 : null
            let clevel1 = settings.custom_level1 != '' ? settings.custom_level1 : null
            let clevel2 = settings.custom_level2 != '' ? settings.custom_level2 : null

            let id0 = settings.id0 != '' ? settings.id0 : null
            let id1 = settings.id1 != '' ? settings.id1 : null
            let id2 = settings.id2 != '' ? settings.id2 : null

            // TODO: what if user inputs level1 or level2 keeping upper layer empty.
            // Also check for valid url

            let custom_shapes = {
                country: 'Custom',
                level_0: clevel0,
                level_1: clevel1,
                level_2: clevel2
            }

            let custom_id = {
                level_0: id0,
                level_1: id1,
                level_2: id2
            }

            let country_topojson = [custom_shapes][0]

            let id = [custom_id][0][level_classes[cur_level]]

            let rect = this.rect
            let layout = this.layout

            //chorocolors

            let chorocolors = d3.scale.linear()
                .domain([settings.min_value, settings.center_value, settings.max_value])
                .range([settings.min_color, settings.center_color, settings.max_color])

            projection
                .scale(1)
                .translate([0, 0])

            // temp
            svg = m
            // m.attr('id', geography)
            topojson = country_topojson[level_classes[cur_level]]
            let current_Event = this.current_Event;
            let expand = this.expand
            let append_error = this.append_error
            let coptions = this.captions

            // Remove all previous shapes
            svg.selectAll('g').remove()

            if (topojson != null) {
                d3.json(topojson, function (err, maps) {
                    if (err) {

                        append_error(coptions, layout, err, 'INVALID JSON FILE')
                        return console.warn(err);
                    }

                    // If we have multiple objects, it's an invalid topojson file. Fix it
                    if (d3.values(maps.objects).length > 0) {
                        var geometries = d3.values(maps.objects)
                            .filter(function (v) { return v['type'] == 'GeometryCollection' })
                            .map(function (v) { return v['geometries'] })
                        maps.objects = {
                            'shape': {
                                geometries: Array.prototype.concat.apply([], geometries),
                                type: 'GeometryCollection'
                            }
                        }
                    }

                    let map_features = tjson.feature(maps, d3.values(maps.objects)[0]).features
                    // let map_features = tjson.feature(maps, maps.objects[_.keys(maps.objects)]).features

                    let allkeys = [], key

                    if (id != null) {
                        map_features.map((b) => {
                            if (!b['properties'][id] && b[id])
                                b['properties'] = { id: b[id] }

                        })
                    }
                    if (cur_level > 0 && geography !== 'default') {
                        map_features.filter(function (d) {
                            let properties = d.properties

                            for (var keys in properties) {
                                if (String(properties[keys]) === String(geography)) {
                                    allkeys.push(keys)
                                }
                            }

                        })
                        key = _.chain(allkeys).countBy().toPairs().max(_.last).head().value()
                    }

                    // Filter maps based on selected geography | Default: Entire level wise map
                    let cur_border = geography != 'default' ? map_features.filter(function (d) {
                        if (cur_level == 1) {
                            var _key = custom_id['level_0'] != null ? custom_id['level_0'] : key;
                            return String(d.properties[_key]) === String(geography)
                        } else if (cur_level == 2) {
                            var _key = custom_id['level_1'] != null ? custom_id['level_1'] : key;
                            return String(d.properties[_key]) === String(geography)
                        } else {
                            return true;
                        }
                    }) : map_features

                    var map_data = cur_border.map((cb) => {

                        // Remove previous level key pair
                        // Eg: if Hawaii is state name and we have "hawaii" as county name as well
                        // remove state level hawaii from temp dict
                        var _temp_props = cb.properties
                        if (key != undefined && cur_level > 0) {
                            delete _temp_props[key]
                        }

                        // var this_shape_props = _.values(cb.properties)
                        var this_shape_props = _.values(_temp_props)

                        // Convert all properties value to string
                        // Users may not be aware of ont to string matching
                        this_shape_props = this_shape_props.map(sp => String(sp))

                        var this_shape = data.filter((df) => {
                            return this_shape_props.indexOf(String(df.category)) > -1
                        })

                        let max_value = d3.max(this_shape.map(ts => ts.value))
                        this_shape = this_shape.filter(df => df.value === max_value)

                        if (this_shape.length > 0) {
                            cb['data'] = this_shape[0]
                            cb['settings'] = settings
                        } else {
                            cb['data'] = null
                            cb['settings'] = settings
                        }
                        return cb
                    })

                    var b = path.bounds({ "type": "FeatureCollection", "features": map_features }),
                        s = 1 / Math.max((b[1][0] - b[0][0]) / layout.width, (b[1][1] - b[0][1]) / layout.height);
                    projection
                        .scale(s)
                        .translate([(layout.width - s * (b[1][0] + b[0][0])) / 2, (layout.height - s * (b[1][1] + b[0][1])) / 2])

                    let mapshapes = svg.selectAll('g')
                        .data(map_data)
                        .enter()
                        .append('g')
                        .attr('class', 'map-grpup')
                        .attr('stroke', d => d.settings.stroke_color)
                        .attr('stroke-width', d => d.settings.stroke_width / 2 + 'px');

                    let shapes = []
                    mapshapes.append('path')
                        .attr("d", path)
                        .attr("class", (d) => {
                            if (settings.zoomsettings.autozoom_enable) {
                                if (d.data != null && settings.hashighlights != undefined && d.data.hashighlight) {
                                    shapes.push(d)
                                }
                            }

                            return level_classes[cur_level]
                        })
                        .attr('fill', (d) => {
                            return d.data !== null ? settings.haslegend ? d.data.legend_color : chorocolors(d.data.value) : settings.no_color
                        })
                        .attr('vector-effect', 'non-scaling-stroke');

                    mapshapes
                        .on('mouseover', function (d) {
                            d3.select(this).attr('opacity', "0.8")
                        })
                        .on('mouseout', function (d) {
                            d3.select(this).attr('opacity', "1")
                        })

                    mapshapes.on('click', function (d) {
                        if (d.data != null && settings.zoomsettings.selectionzoom_enable && (settings.hashighlights === undefined || d.data.hashighlight))
                            expand(path, d, layout, m, cur_level, zoom, settings, current_Event)

                        Visual.clicked = d.data != null ? d.data.category : Visual.clicked

                        if (d.data !== null && allowInteractions && (settings.hashighlights === undefined || d.data.hashighlight)) {
                            selectionManager.select(d.data.selectionId).then((ids: ISelectionId[]) => {

                                let stroke_width = d.settings.stroke_width;
                                mapshapes.attr({
                                    'fill-opacity': ids.length > 0 ? 0.2 : 1,
                                });
                                d3.select(this).attr({
                                    'fill-opacity': 1,
                                });
                                if (ids.length <= 0 && settings.zoomsettings.selectionzoom_enable) {
                                    Visual.clicked = 'default'
                                    if (geography !== 'default')
                                        expand(path, { 'type': 'FeatureCollection', 'features': cur_border }, layout, m, cur_level, zoom, settings, current_Event)
                                    else
                                        contract(path, layout, m)
                                }
                            });
                            (<Event>d3.event).stopPropagation();
                        }
                    });
                    mapshapes.attr('fill-opacity', (d) => {

                        if (d.data !== null) {
                            return d.data.hashighlight ? 1 : 0.2
                        } else {
                            return 1
                        }
                    })

                    let curcols = options.dataViews[0].metadata.columns.map(c => c.displayName)
                    tooltipServiceWrapper.addTooltip(mapshapes.selectAll('.' + level_classes[cur_level]),
                        (tooltipEvent: TooltipEventArgs<number>) => Visual.getTooltipData(tooltipEvent.data, curcols),
                        (tooltipEvent: TooltipEventArgs<number>) => null);

                    rect.on('click', function (d) {
                        mapshapes.attr({
                            'fill-opacity': 1
                        });
                        selectionManager.clear()
                        expand(path, { 'type': 'FeatureCollection', 'features': cur_border }, layout, m, cur_level, zoom, settings, 'drillup')
                    });

                    //for zooming to all selected shapes
                    if (settings.hashighlights != undefined && settings.zoomsettings.autozoom_enable && shapes.length > 0) {

                        expand(path, { 'type': 'FeatureCollection', 'features': shapes }, layout, m, cur_level, zoom, settings, 'drillup')

                    }
                    else if (geography !== 'default') {
                        expand(path, { 'type': 'FeatureCollection', 'features': cur_border }, layout, m, cur_level, zoom, settings, current_Event)
                    }
                })
            }
        }

        constructor(options: VisualConstructorOptions) {
            this.levelStack = [];
            this.host = options.host;
            this.selectionManager = options.host.createSelectionManager();
            this.tooltipServiceWrapper = createTooltipServiceWrapper(this.host.tooltipService, options.element);
            let svg = this.svg = d3.select(options.element)
                .append('svg')
                .classed('map', true)
                .attr("preserveAspectRatio", "xMidYMid meet")
                .style("position", "absolute");

            this.legend = createLegend(
                $(options.element),
                options.host && false,
                undefined,
                true);

            this.captions = options

            Visual.clicked = 'default';
            Visual.previous_clicked = 'default';
            this.current_Event = 'drillup'
        }

        public update(options: VisualUpdateOptions) {
            if (isDataReady(options) == false) {
                this.svg.selectAll('*').remove()
                d3.select('#legendGroup').selectAll('*').remove()
                d3.selectAll('.error').remove()

                return;
            }

            d3.selectAll('.error').remove()

            var temp = options.dataViews[0].metadata.columns;
            var temp_indexes = []
            var temp_ii = []
            _.each(temp, (v, i) => {
                if (v.roles['category']) {
                    temp_indexes.push(v.displayName)
                    temp_ii.push(i)
                }
            })

            let cur_level;
            var temp_sources = options.dataViews[0].matrix.rows.levels[0].sources.filter(s => temp_indexes.indexOf(s.identityExprs[0]['ref']) > -1)
            if (temp_sources.length > 1) {
                cur_level = temp_sources.length - 1
            } else {
                cur_level = temp_sources[0].index - temp_ii[0]
            }

            if (temp_sources.length > 1) {
                let index = options.dataViews[0].matrix.rows.root.childIdentityFields.map(s => s['ref']).indexOf(temp_indexes[temp_sources.length - 2])

                Visual.clicked = options.dataViews[0].matrix.rows.root.children[0].levelValues[index].value
            }

            if (cur_level < Visual.previous_level) {
                this.current_Event = 'drillup'
                this.selectionManager.clear()
                if (temp_sources.length === 1)
                    Visual.clicked = Visual.previous_clicked
            }

            else if ((cur_level > Visual.previous_level) && Visual.clicked != 'default') {
                this.current_Event = 'drilldown'
            }

            Visual.previous_level = cur_level

            // DataPoint variables
            let viewModel = this.viewModel = this.visualTransform(options, this.host, Visual.clicked);
            let selectionManager = this.selectionManager;
            let allowInteractions = this.host.allowInteractions;
            let settings = this.settings = viewModel.settings;
            let data = this.data = viewModel.dataPoints;
            let legend_data = this.legend_data = viewModel.legenddata;

            if ((settings.custom_level0 === null || settings.custom_level0 === '') && (settings.custom_level1 || settings.custom_level2)) {
                this.svg.selectAll('*').remove()

                this.append_error(this.captions, this.layout, '', 'Specify level 1 JSON')

                return;
            }

            if ((settings.custom_level1 === null || settings.custom_level1 === '') && settings.custom_level2) {
                this.svg.selectAll('*').remove()

                this.append_error(this.captions, this.layout, '', 'Specify level 2 JSON')
                return;
            }

            this.layout = { height: options.viewport.height, width: options.viewport.width }

            let projection_choice = [
                { name: 'albersUSA', projection: d3.geo.albersUsa() },
                { name: 'Equirectangular', projection: d3.geo.equirectangular() },
                { name: 'Orthographic', projection: d3.geo.orthographic() },
                { name: 'Mercator', projection: d3.geo.mercator() },
                { name: 'albers', projection: d3.geo.albers() }
            ]
            let pc = projection_choice.filter(function (p) {
                if (p.name === settings.projection) //TODO: get this from options
                    return true
            })[0];

            this.settings.legend_show ? this.renderLegend() : d3.select('#legendGroup').selectAll('*').remove()
            this.updateViewport()

            this.projection = pc.projection;
            this.path = d3.geo.path()
                .projection(this.projection);
            this.projection
                .scale(1)
                .translate([0, 0])

            // Basic SVG setup
            let svg = this.svg;

            svg.attr({
                height: this.layout.height,
                width: this.layout.width
            })

            svg.selectAll('*').remove()

            let rect = this.rect = svg.append("rect")
                .attr("width", this.layout.width)
                .attr("height", this.layout.height)

            let m = svg.append('g')

            var zoom = d3.behavior.zoom()
                .translate([0, 0])
                .scale(1)
                .scaleExtent([1, 20])
                .on("zoom", function () {
                    m.attr("transform", "translate(" + d3.event['translate'] + ")scale(" + d3.event['scale'] + ")");
                });
            if (this.settings.zoomsettings.manualzoom_enable) {
                svg
                    .call(zoom) // delete this line to disable free zooming
                    .call(zoom.event);
            } else {
                svg.call(zoom.event);
            }

            m.attr({
                height: this.layout.height,
                width: this.layout.width

            });

            // local references
            let path = this.path;
            let projection = this.projection;
            if (cur_level === 0) {

                Visual.clicked = 'default'
            }

            else if (cur_level === 1) {
                Visual.previous_clicked = Visual.clicked
            }

            // Draw Map
            this.drawmap(
                svg,
                m,
                projection,
                path, options,
                Visual.clicked,
                cur_level,
                selectionManager,
                viewModel,
                allowInteractions,
                Visual,
                this.tooltipServiceWrapper,
                zoom)
        }

        public destroy(): void {
            console.log('destroy')
        }

        private updateViewport(): void {
            let legendMargins: IViewport = this.legend.getMargins(),
                position: any

            position = LegendPosition[legendPosition[this.settings.legend.position] as string];
            switch (position) {
                case LegendPosition.Top:
                case LegendPosition.TopCenter:
                case LegendPosition.Bottom:
                case LegendPosition.BottomCenter: {
                    this.layout.height = this.layout.height - legendMargins.height

                    break;
                }
                case LegendPosition.Left:
                case LegendPosition.LeftCenter:
                case LegendPosition.Right:
                case LegendPosition.RightCenter: {
                    this.layout.width = this.layout.width - legendMargins.width

                    break;
                }
            }
        }

        private static getTooltipData(value: any, cols: any): VisualTooltipDataItem[] {
            var zip = rows => rows[0].map((_, c) => rows.map(row => row[c]))
            var tooltips = []
            if (value.data != null) {
                var tooltipdata = zip([cols, value.data.formatted_value])
                tooltipdata.forEach((t) => {
                    var temp = {}
                    temp['displayName'] = t[0]
                    temp['value'] = `${t[1]}`
                    tooltips.push(temp)
                })
            } else {
                tooltips.push({ 'displayName': 'No Data' })
            }
            return tooltips;
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];
            let settings = this.settings;
            let data = this.data;
            switch (objectName) {

                case 'categorycolorselector':
                    if (!settings.haslegend)
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                mincolor: {
                                    solid: {
                                        color: settings.min_color
                                    }
                                },
                                centercolor: {
                                    solid: {
                                        color: settings.center_color
                                    }
                                },
                                maxcolor: {
                                    solid: {
                                        color: settings.max_color
                                    }
                                },
                                minvalue: settings.min_value,
                                centervalue: settings.center_value,
                                maxvalue: settings.max_value
                            },
                            selector: null
                        })

                    break;

                case 'countryselector':
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {

                            projection: settings.projection,
                            level0: settings.custom_level0,
                            level1: settings.custom_level1,
                            level2: settings.custom_level2,
                            id0: settings.id0,
                            id1: settings.id1,
                            id2: settings.id2,

                        },
                        selector: null
                    })
                    break;

                case 'defaultSelector':
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: 'Default Colors',
                        properties: {
                            nocolor: {
                                solid: {
                                    color: settings.no_color
                                }
                            },
                            width: settings.stroke_width,
                            strokecolor: {
                                solid: {
                                    color: settings.stroke_color
                                }
                            }


                        },
                        validValues: {
                            width: {
                                numberRange: {
                                    min: 0.0,
                                    max: 4.0
                                }
                            }
                        },
                        selector: null

                    });
                    break;

                case 'ordinalcolors':

                    for (let d of this.legend_data.dataPoints) {
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {

                                datacolor: {
                                    solid: {
                                        color: d.color
                                    }
                                }
                            },
                            displayName: d.label + "",
                            selector: d.identity.getSelector()
                        })

                    }
                    break;

                case 'legendproperties':
                    if (settings.haslegend)
                        objectEnumeration.push({
                            objectName: objectName,
                            properties: {
                                show: settings.legend.show,
                                position: settings.legend.position,
                                title: settings.legend.showTitle,
                                color: settings.legend.labelColor,
                                fontsize: settings.legend.fontSize
                            },
                            validValues: {
                                fontsize: {
                                    numberRange: {
                                        min: 8,
                                        max: 40
                                    }
                                }
                            },
                            selector: null
                        })
                    break

                case "zoomselector":
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            Autozoom: settings.zoomsettings.autozoom_enable,
                            Selectionzoom: settings.zoomsettings.selectionzoom_enable,
                            Manualzoom: settings.zoomsettings.manualzoom_enable
                        },
                        selector: null
                    })
            }

            return objectEnumeration
        }

        public append_error(options, layout, err, err_message) {

            let error = d3.select(options.element)
                .append('svg')
                .attr('class', 'error')
                .attr('width', layout.width)
                .attr('height', layout.height)
                .style('position', 'absolute')


            let rect = error.append('rect')
                .attr('width', layout.width)
                .attr('height', layout.height / 4)
                .attr('class', 'error-rect')
                .attr('y', layout.height / 3)


            let t = error.append('text')
                .attr('x', layout.width / 4)
                .attr('y', layout.height / 2.2)
                .attr("dy", ".65em")


            t.append('tspan')
                .text(err_message)
                .attr('x', layout.width / 3.7)
                .attr('y', layout.height / 2.3)

            t.append('tspan')
                .text(err.responseText)
                .attr('x', layout.width / 4)
                .attr('y', layout.height / 2.0)
        }
    }
}
