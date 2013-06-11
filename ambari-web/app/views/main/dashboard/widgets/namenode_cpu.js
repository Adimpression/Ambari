/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var App = require('app');

App.NameNodeCpuPieChartView = App.DashboardWidgetView.extend({

  title: Em.I18n.t('dashboard.widgets.NameNodeCpu'),
  id: '3',

  isPieChart: true,
  isText: false,
  isProgressBar: false,
  model_type: 'hdfs',
  hiddenInfo: function () {
    var value = this.get('model.nameNodeCpu');
    value = value >= 100 ? 100: value;
    var result = [];
    result.pushObject((value + 0).toFixed(2) + '%');
    result.pushObject(' CPU wait I/O');
    return result;
  }.property('model.nameNodeCpu'),

  thresh1: 40,// can be customized
  thresh2: 70,
  maxValue: 100,

  content: App.ChartPieView.extend({

    model: null,  //data bind here
    id: 'widget-nn-cpu', // html id
    stroke: '#D6DDDF', //light grey
    thresh1: null,  // can be customized later
    thresh2: null,
    innerR: 25,

    existCenterText: true,
    centerTextColor: function () {
      return this.get('contentColor');
    }.property('contentColor'),

    palette: new Rickshaw.Color.Palette ({
      scheme: [ '#FFFFFF', '#D6DDDF'].reverse()
    }),

    data: function () {
      var value = this.get('model.nameNodeCpu');
      value = value >= 100 ? 100: value;
      var percent = (value + 0).toFixed();
      return [ percent, 100 - percent];
    }.property('model.nameNodeCpu'),

    contentColor: function () {
      var used = parseFloat(this.get('data')[0]);
      var thresh1 = parseFloat(this.get('thresh1'));
      var thresh2 = parseFloat(this.get('thresh2'));
      var color_green = '#95A800';
      var color_red = '#B80000';
      var color_orange = '#FF8E00';
      if (used <= thresh1) {
        this.set('palette', new Rickshaw.Color.Palette({
          scheme: [ '#FFFFFF', color_green  ].reverse()
        }))
        return color_green;
      } else if (used <= thresh2) {
        this.set('palette', new Rickshaw.Color.Palette({
          scheme: [ '#FFFFFF', color_orange  ].reverse()
        }))
        return color_orange;
      } else {
        this.set('palette', new Rickshaw.Color.Palette({
          scheme: [ '#FFFFFF', color_red  ].reverse()
        }))
        return color_red;
      }
    }.property('data', 'thresh1', 'thresh2'),

    // refresh text and color when data in model changed
    refreshSvg: function () {
      // remove old svg
      var old_svg =  $("#" + this.id);
      old_svg.remove();

      // draw new svg
      this.appendSvg();
    }.observes('model.nameNodeCpu', 'thresh1', 'thresh2')
  })

})