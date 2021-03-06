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

module.exports = Em.Route.extend({
  route: '/installer',
  App: require('app'),

  enter: function (router) {
    console.log('in /installer:enter');

    if (router.getAuthenticated()) {
      if (App.db.getUser().admin) {
        router.get('mainController').stopLoadOperationsPeriodically();
        console.log('In installer with successful authenticated');
        console.log('current step=' + router.get('installerController.currentStep'));
        Ember.run.next(function () {
          var installerController = router.get('installerController');
          router.transitionTo('step' + installerController.get('currentStep'));
        });
      } else {
        Em.run.next(function () {
          App.router.transitionTo('main.services');
        });
      }
    } else {
      console.log('In installer but its not authenticated');
      console.log('value of authenticated is: ' + router.getAuthenticated());
      Ember.run.next(function () {
        router.transitionTo('login');
      });
    }
  },

  routePath: function (router, event) {
    console.log("INFO: value of router is: " + router);
    console.log("INFO: value of event is: " + event);
    router.setNavigationFlow(event);
    if (!router.isFwdNavigation) {
      this._super(router, event);
    } else {
      router.set('backBtnForHigherStep', true);

      var installerController = router.get('installerController');
      router.transitionTo('step' + installerController.get('currentStep'));
    }
  },

  connectOutlets: function (router, context) {
    console.log('in /installer:connectOutlets');
    router.get('applicationController').connectOutlet('installer');
  },

  step1: Em.Route.extend({
    route: '/step1',
    connectOutlets: function (router) {
      console.log('in installer.step1:connectOutlets');
      var controller = router.get('installerController');
      controller.setCurrentStep('1');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep1', controller.get('content'));
    },

    next: function (router) {
      var installerController = router.get('installerController');
      installerController.save('cluster');
      installerController.clearHosts();
      router.transitionTo('step2');
    }
  }),

  step2: Em.Route.extend({
    route: '/step2',
    connectOutlets: function (router, context) {
      router.setNavigationFlow('step2');

      var controller = router.get('installerController');
      controller.setCurrentStep('2');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep2', controller.get('content'));
    },
    back: Em.Router.transitionTo('step1'),
    next: function (router) {
      var controller = router.get('installerController');
      var wizardStep2Controller = router.get('wizardStep2Controller');
      wizardStep2Controller.patternExpression();
      controller.saveHosts(wizardStep2Controller);
      router.transitionTo('step3');
      App.db.setBootStatus(false);
    },

    /**
     * Validate form before doing anything
     * @param router
     */
    evaluateStep: function (router) {
      var wizardStep2Controller = router.get('wizardStep2Controller');
      wizardStep2Controller.set('hasSubmitted', true);

      if (!wizardStep2Controller.get('isSubmitDisabled')) {
        wizardStep2Controller.evaluateStep();
      }
    }
  }),

  step3: Em.Route.extend({
    route: '/step3',
    connectOutlets: function (router) {
      console.log('in installer.step3:connectOutlets');
      var controller = router.get('installerController');
      controller.setCurrentStep('3');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep3', controller.get('content'));
    },
    back: Em.Router.transitionTo('step2'),
    next: function (router, context) {
      var installerController = router.get('installerController');
      var wizardStep3Controller = router.get('wizardStep3Controller');
      installerController.saveConfirmedHosts(wizardStep3Controller);
      App.db.setBootStatus(true);
      var displayOrderConfig = require('data/services');
      var apiUrl = '/stacks/HDP/version/1.2.0';
      router.get('installerController').loadServiceComponents(router.get('wizardStep4Controller'), displayOrderConfig, apiUrl);
      var apiService = router.get('wizardStep4Controller').get('serviceComponents');
      App.db.setService(apiService);
      router.transitionTo('step4');
    },
    /**
     * Wrapper for remove host action.
     * Since saving data stored in installerController, we should call this from router
     * @param router
     * @param context Array of hosts to delete
     */
    removeHosts: function (router, context) {
      console.log('in installer.step2.removeHosts:hosts to delete ', context);
      var controller = router.get('installerController');
      controller.removeHosts(context);
    }
  }),

  step4: Em.Route.extend({
    route: '/step4',
    connectOutlets: function (router, context) {
      router.setNavigationFlow('step4');
      var controller = router.get('installerController');
      controller.setCurrentStep('4');
      controller.loadAllPriorSteps();
      controller.loadServices();
      controller.connectOutlet('wizardStep4', controller.get('content.services'));
    },
    back: Em.Router.transitionTo('step3'),

    next: function (router) {
      var controller = router.get('installerController');
      var wizardStep4Controller = router.get('wizardStep4Controller');
      controller.saveServices(wizardStep4Controller);
      controller.saveClients(wizardStep4Controller);

      App.db.setMasterComponentHosts(undefined);
      router.transitionTo('step5');
    }
  }),

  step5: Em.Route.extend({
    route: '/step5',
    connectOutlets: function (router, context) {
      router.setNavigationFlow('step5');

      var controller = router.get('installerController');
      var wizardStep5Controller = router.get('wizardStep5Controller');
      controller.setCurrentStep('5');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep5', controller.get('content'));
    },
    back: Em.Router.transitionTo('step4'),
    next: function (router) {
      var controller = router.get('installerController');
      var wizardStep5Controller = router.get('wizardStep5Controller');
      controller.saveMasterComponentHosts(wizardStep5Controller);
      App.db.setSlaveComponentHosts(undefined);
      router.transitionTo('step6');
    }
  }),

  step6: Em.Route.extend({
    route: '/step6',
    connectOutlets: function (router, context) {
      router.setNavigationFlow('step6');

      var controller = router.get('installerController');
      controller.setCurrentStep('6');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep6', controller.get('content'));
    },
    back: Em.Router.transitionTo('step5'),

    next: function (router) {
      var controller = router.get('installerController');
      var wizardStep6Controller = router.get('wizardStep6Controller');

      if (wizardStep6Controller.validate()) {
        controller.saveSlaveComponentHosts(wizardStep6Controller);
        controller.get('content').set('serviceConfigProperties', null);
        App.db.setServiceConfigProperties(null);
        App.db.setSlaveProperties(null);
        controller.loadSlaveGroupProperties();
        controller.loadAdvancedConfigs();
        router.transitionTo('step7');
      }
    }
  }),

  step7: Em.Route.extend({
    route: '/step7',
    enter: function (router) {
      console.log('in /wizardStep7Controller:enter');
      var controller = router.get('installerController');
      controller.setCurrentStep('7');
      controller.loadAllPriorSteps();
    },
    connectOutlets: function (router, context) {
      var controller = router.get('installerController');
      controller.connectOutlet('wizardStep7', controller.get('content'));
    },
    back: Em.Router.transitionTo('step6'),
    next: function (router) {
      var installerController = router.get('installerController');
      var wizardStep7Controller = router.get('wizardStep7Controller');
      installerController.saveServiceConfigProperties(wizardStep7Controller);
      router.transitionTo('step8');
    }
  }),

  step8: Em.Route.extend({
    route: '/step8',
    connectOutlets: function (router, context) {
      console.log('in installer.step8:connectOutlets');
      var controller = router.get('installerController');
      controller.setCurrentStep('8');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep8', controller.get('content'));
    },
    back: Em.Router.transitionTo('step7'),
    next: function (router) {
      var installerController = router.get('installerController');
      var wizardStep8Controller = router.get('wizardStep8Controller');
      // invoke API call to install selected services
      installerController.installServices();
      installerController.setInfoForStep9();
      router.transitionTo('step9');
    }
  }),

  step9: Em.Route.extend({
    route: '/step9',
    connectOutlets: function (router, context) {
      console.log('in installer.step9:connectOutlets');
      var controller = router.get('installerController');
      controller.setCurrentStep('9');
      controller.loadAllPriorSteps();
      if (!App.testMode) { // if test mode is ON don't disable prior steps link.
        controller.setLowerStepsDisable(9);
      }
      controller.connectOutlet('wizardStep9', controller.get('content'));
    },
    back: Em.Router.transitionTo('step8'),
    retry: function (router) {
      var installerController = router.get('installerController');
      var wizardStep9Controller = router.get('wizardStep9Controller');
      if (!wizardStep9Controller.get('isSubmitDisabled')) {
        if (wizardStep9Controller.get('content.cluster.status') !== 'START FAILED') {
          installerController.installServices(true);
          installerController.setInfoForStep9();
        } else {
          wizardStep9Controller.set('content.cluster.isCompleted', false);
        }
        wizardStep9Controller.navigateStep();
      }
    },
    unroutePath: function () {
      return false;
    },
    next: function (router) {
      var installerController = router.get('installerController');
      var wizardStep9Controller = router.get('wizardStep9Controller');
      installerController.saveInstalledHosts(wizardStep9Controller);
      router.transitionTo('step10');
    }
  }),

  step10: Em.Route.extend({
    route: '/step10',
    connectOutlets: function (router, context) {
      console.log('in installer.step10:connectOutlets');
      var controller = router.get('installerController');
      controller.setCurrentStep('10');
      controller.loadAllPriorSteps();
      controller.connectOutlet('wizardStep10', controller.get('content'));
    },
    back: Em.Router.transitionTo('step9'),
    complete: function (router, context) {
      if (true) {   // this function will be moved to installerController where it will validate
        var controller = router.get('installerController');
        controller.finish();
        router.transitionTo('main.index');
      } else {
        console.log('cluster installation failure');
      }
    }
  }),

  gotoStep1: Em.Router.transitionTo('step1'),

  gotoStep2: Em.Router.transitionTo('step2'),

  gotoStep3: Em.Router.transitionTo('step3'),

  gotoStep4: Em.Router.transitionTo('step4'),

  gotoStep5: Em.Router.transitionTo('step5'),

  gotoStep6: Em.Router.transitionTo('step6'),

  gotoStep7: Em.Router.transitionTo('step7'),

  gotoStep8: Em.Router.transitionTo('step8'),

  gotoStep9: Em.Router.transitionTo('step9'),

  gotoStep10: Em.Router.transitionTo('step10')

});