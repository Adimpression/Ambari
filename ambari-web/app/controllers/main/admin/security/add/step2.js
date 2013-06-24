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
App.MainAdminSecurityAddStep2Controller = Em.Controller.extend({

  name: 'mainAdminSecurityAddStep2Controller',
  stepConfigs: [],
  installedServices: [],
  selectedService: null,

  isSubmitDisabled: function () {
    return !this.stepConfigs.filterProperty('showConfig', true).everyProperty('errorCount', 0);
  }.property('stepConfigs.@each.errorCount'),

  clearStep: function () {
    this.get('stepConfigs').clear();
  },


  /**
   *  Function is called whenever the step is loaded
   */
  loadStep: function () {
    console.log("TRACE: Loading addSecurity step2: Configure Services");
    this.clearStep();
    this.addMasterHostToGlobals(this.get('content.services'));
    this.renderServiceConfigs(this.get('content.services'));
    var storedServices = this.get('content.serviceConfigProperties');
    if (storedServices) {
      var configs = new Ember.Set();

      // for all services`
      this.get('stepConfigs').forEach(function (_content) {
        //for all components
        _content.get('configs').forEach(function (_config) {

          var componentVal = storedServices.findProperty('name', _config.get('name'));
          //if we have config for specified component
          if (componentVal) {
            //set it
            _config.set('value', componentVal.value);
          }

        }, this);
      }, this);

    }
    //
    this.set('installedServices', App.Service.find().mapProperty('serviceName'));
    console.log("The services are: " + this.get('installedServices'));
    //
  },

  /**
   * Render configs for active services
   * @param serviceConfigs
   */
  renderServiceConfigs: function (serviceConfigs) {
    serviceConfigs.forEach(function (_serviceConfig) {

      var serviceConfig = App.ServiceConfig.create({
        filename: _serviceConfig.filename,
        serviceName: _serviceConfig.serviceName,
        displayName: _serviceConfig.displayName,
        configCategories: _serviceConfig.configCategories,
        showConfig: true,
        configs: []
      });

      this.loadComponentConfigs(_serviceConfig, serviceConfig);

      console.log('pushing ' + serviceConfig.serviceName, serviceConfig);

      this.get('stepConfigs').pushObject(serviceConfig);
    }, this);
    this.set('selectedService', this.get('stepConfigs').filterProperty('showConfig', true).objectAt(0));
  },

  /**
   * Load child components to service config object
   * @param _componentConfig
   * @param componentConfig
   */
  loadComponentConfigs: function (_componentConfig, componentConfig) {
    _componentConfig.configs.forEach(function (_serviceConfigProperty) {
      var serviceConfigProperty = App.ServiceConfigProperty.create(_serviceConfigProperty);
      componentConfig.configs.pushObject(serviceConfigProperty);
      serviceConfigProperty.set('isEditable', serviceConfigProperty.get('isReconfigurable'));
      serviceConfigProperty.validate();
    }, this);
  },


  addMasterHostToGlobals: function (serviceConfigs) {
    var oozieService = serviceConfigs.findProperty('serviceName', 'OOZIE');
    var hiveService = serviceConfigs.findProperty('serviceName', 'HIVE');
    var webHcatService = App.Service.find().mapProperty('serviceName').contains('WEBHCAT');
    var nagiosService = serviceConfigs.findProperty('serviceName', 'NAGIOS');
    var generalService = serviceConfigs.findProperty('serviceName', 'GENERAL');
    if (oozieService) {
      var oozieServerHost = oozieService.configs.findProperty('name', 'oozie_servername');
      var oozieServerPrincipal = oozieService.configs.findProperty('name', 'oozie_principal_name');
      var oozieSpnegoPrincipal =  generalService.configs.findProperty('name', 'oozie_http_principal_name');
      if (oozieServerHost && oozieServerPrincipal && oozieSpnegoPrincipal) {
        oozieServerHost.defaultValue = App.Service.find('OOZIE').get('hostComponents').findProperty('componentName', 'OOZIE_SERVER').get('host.hostName');
        oozieServerPrincipal.defaultValue = 'oozie/' + oozieServerHost.defaultValue;
        oozieSpnegoPrincipal.defaultValue = 'HTTP/' + oozieServerHost.defaultValue;
        oozieSpnegoPrincipal.isVisible = true;
      }
    }
    if (hiveService) {
      var hiveServerHost = hiveService.configs.findProperty('name', 'hive_metastore');
      if (hiveServerHost) {
        hiveServerHost.defaultValue = App.Service.find('HIVE').get('hostComponents').findProperty('componentName', 'HIVE_SERVER').get('host.hostName');
      }
    }

    if(webHcatService) {
      var webHcatHost =  App.Service.find('WEBHCAT').get('hostComponents').findProperty('componentName', 'WEBHCAT_SERVER').get('host.hostName');
      var webHcatSpnegoPrincipal =  generalService.configs.findProperty('name', 'webHCat_http_principal_name');
      if(webHcatHost && webHcatSpnegoPrincipal) {
        webHcatSpnegoPrincipal.defaultValue = 'HTTP/' + webHcatHost;
        webHcatSpnegoPrincipal.isVisible = true;
      }
    }

    if(nagiosService) {
      var nagiosServerHost = nagiosService.configs.findProperty('name', 'nagios_server');
      var nagiosServerPrincipal = nagiosService.configs.findProperty('name', 'nagios_principal_name');
      if (nagiosServerHost && nagiosServerPrincipal) {
        nagiosServerHost.defaultValue = App.Service.find('NAGIOS').get('hostComponents').findProperty('componentName', 'NAGIOS_SERVER').get('host.hostName');
        nagiosServerPrincipal.defaultValue = 'nagios/' + nagiosServerHost.defaultValue;
      }
    }
  },

  /**
   *  submit and move to step3
   */

  submit: function () {
    if (!this.get('isSubmitDisabled')) {
      App.router.send('next');
    }
  }

});