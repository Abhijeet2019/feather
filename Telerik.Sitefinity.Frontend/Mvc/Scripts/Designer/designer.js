﻿
(function ($) {
    if (typeof ($telerik) != 'undefined') {
        $telerik.$(document).one('dialogRendered', function () {
            angular.$$csp().noInlineStyle = true;
            angular.bootstrap($('.designer'), ['designer']);
        });
    }

    var endsWith = function (str, suffix) {
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    };

    var resolveDefaultView = function (serverData) {
        return serverData.get('defaultView');
    };

    var resolveControllerName = function (view) {
        return view + 'Ctrl';
    };

    var resolveTemplateUrl = function (view, serverData) {
        var widgetName = serverData.get('widgetName');
        var templatePath = String.format('Telerik.Sitefinity.Frontend/Designer/View/{0}/{1}?controlId={2}&mediaType={3}', widgetName, view, serverData.get('controlId'), serverData.get("mediaType"));

        var moduleName = serverData.get('moduleName');
        if (moduleName) {
            templatePath = String.format('{0}&moduleName={1}', templatePath, moduleName);
        }
        return sitefinity.getRootedUrl(sitefinity.appendPackageParameter(templatePath));
    };

    var designerModule = angular.module('designer', ['pageEditorServices', 'ngRoute', 'modalDialog', 'serverDataModule']);

    designerModule.config(['$routeProvider', '$httpProvider', 'serverDataProvider', function ($routeProvider, $httpProvider, serverDataProvider) {
        // Removes the angularjs route params from the URL.
        if (!!window.location.hash) {
            history.pushState('', document.title, window.location.pathname + window.location.search);
        }

        var serverData = serverDataProvider.$get();

        $routeProvider
            .when('/:view', {
                templateUrl: function (params) {
                    return resolveTemplateUrl(params.view, serverData);
                },
                controller: 'RoutingCtrl'
            })
            .otherwise({
                redirectTo: '/' + resolveDefaultView(serverData)
            });

        $httpProvider.interceptors.push(function ($q, $window) {
            return {
                'request': function (config) {
                    if (config && config.method === 'GET' && config.headers && config.headers.SF_UI_CULTURE === undefined && config.url && endsWith(config.url, '.sf-cshtml')) {
                        config.headers.SF_UI_CULTURE = serverData.get('culture');
                    }

                    return config;
                },
                'responseError': function (rejection) {
                    if (rejection.status === 401 || rejection.status === 403) {
                        rejection.data = rejection.statusText;
                        $window.onbeforeunload = null;
                        $window.location.reload();
                    }
                    return $q.reject(rejection);
                }
            };
        });
    }]);

    designerModule.run(['$rootScope', 'dialogFeedbackService', function ($rootScope, dialogFeedbackService) {
        $rootScope.feedback = dialogFeedbackService;

        $rootScope.$on('$routeChangeStart', function () {
            $rootScope.feedback.showLoadingIndicator = true;
        });

        $rootScope.$on('$routeChangeSuccess', function () {
            $rootScope.feedback.showLoadingIndicator = false;
        });

        $rootScope.$on('$routeChangeError', function () {
            $rootScope.feedback.showLoadingIndicator = false;
            $rootScope.feedback.errorMessage = 'Could not load designer view!';
            $rootScope.feedback.showError = true;
        });
    }]);

    designerModule.factory('dialogFeedbackService', function () {
        return {
            showLoadingIndicator: false,
            showError: false,
            errorMessage: null,

            savingHandlers: [],
            cancelingHandlers: []
        };
    });

    designerModule.directive('section', ['$compile', function ($compile) {
        return {
            restrict: 'AC',
            link: function (scope, element, attr) {
                var placeholder = $('[placeholder="' + attr.section + '"]');
                var selectedScope;
                if (attr.useElementScope === 'true') {
                    selectedScope = scope;
                } else {
                    selectedScope = angular.element('.modal-body').scope();
                }
                if (placeholder.length > 0) {
                    placeholder.html($compile(element.html())(selectedScope));
                }
            }
        };
    }]);

    designerModule.controller('RoutingCtrl', ['$scope', '$routeParams', '$controller',
        function ($scope, $routeParams, $controller) {
            try {
                $controller(resolveControllerName($routeParams.view), { $scope: $scope });
            }
            catch (err) {
                $controller('DefaultCtrl', { $scope: $scope });
            }
        }
    ]);

    designerModule.controller('DefaultCtrl', ['$scope', 'propertyService', function ($scope, propertyService) {
        $scope.feedback.showLoadingIndicator = true;

        propertyService.get()
            .then(function (data) {
                if (data && data.Items) {
                    $scope.properties = propertyService.toAssociativeArray(data.Items);
                }
            },
            function (errorData) {
                $scope.feedback.showError = true;
                if (errorData && errorData.data)
                    $scope.feedback.errorMessage = errorData.data.Detail;
            })
            .finally(function () {
                $scope.feedback.showLoadingIndicator = false;
            });
    }]);

    designerModule.controller('DialogCtrl', ['$rootScope', '$scope', '$q', '$uibModalInstance', '$route', 'propertyService', 'widgetContext',
        function ($rootScope, $scope, $q, $uibModalInstance, $route, propertyService, widgetContext) {
            var isSaveToAllTranslations = true;

            // ------------------------------------------------------------------------
            // Event handlers
            // ------------------------------------------------------------------------

            var onError = function (errorData) {
                $scope.feedback.showError = true;
                if (errorData && errorData.data)
                    $scope.feedback.errorMessage = errorData.data.Detail ? errorData.data.Detail : errorData.data;
            };

            // ------------------------------------------------------------------------
            // helper methods
            // ------------------------------------------------------------------------

            var saveProperties = function () {
                var saveMode = {
                    Default: 0,
                    AllTranslations: 1,
                    CurrentTranslationOnly: 2
                };

                if (widgetContext.culture) {
                    currentSaveMode = isSaveToAllTranslations ? saveMode.AllTranslations : saveMode.CurrentTranslationOnly;
                }
                else {
                    currentSaveMode = saveMode.Default;
                }

                return propertyService.save(currentSaveMode);
            };

            var executeHandlers = function (handlers) {
                return function () {
                    return $q.all(handlers.map(function (h) {
                        if (angular.isFunction(h)) {
                            return h();
                        }
                        else {
                            throw 'Handlers should be functions!';
                        }
                    }));
                };
            };

            // ------------------------------------------------------------------------
            // Scope variables and setup
            // ------------------------------------------------------------------------

            $scope.feedback.showLoadingIndicator = true;
            $scope.feedback.showError = false;

            //the save action - it will check which properties are changed and send only them to the server 
            $scope.save = function (saveToAllTranslations) {
                isSaveToAllTranslations = saveToAllTranslations;

                var saving = $q.defer();
                saving.promise
                    .then(executeHandlers($scope.feedback.savingHandlers))
                    .then(saveProperties)
                    .then($scope.close)
                    .catch(onError)
                    .finally(function () {
                        $scope.feedback.showLoadingIndicator = false;
                    });

                $scope.feedback.showLoadingIndicator = true;
                saving.resolve();
            };

            $scope.cancel = function () {
                var canceling = $q.defer();
                canceling.promise
                    .then(executeHandlers($scope.feedback.cancelingHandlers))
                    .then(function () {
                        propertyService.reset();
                        $scope.close();
                    })
                    .catch(onError)
                    .finally(function () {
                        $scope.feedback.showLoadingIndicator = false;
                    });

                $scope.feedback.showLoadingIndicator = true;
                canceling.resolve();
            };

            $scope.close = function () {
                try {
                    $uibModalInstance.close();
                } catch (e) { }

                if (typeof ($telerik) !== 'undefined')
                    $telerik.$(document).trigger('modalDialogClosed');

                if (typeof CustomEvent == "function") {
                    var evt = new CustomEvent('sfModalDialogClosed');
                    document.dispatchEvent(evt);
                }

                $rootScope.$destroy();
            };

            $scope.hideSaveAllTranslations = widgetContext.hideSaveAllTranslations;

            $scope.isCurrentView = function (view) {
                return $route.current && $route.current.params.view === view;
            };

            $scope.hideError = function () {
                $scope.feedback.showError = false;
                $scope.feedback.errorMessage = null;
            };

            propertyService.get().catch(onError);
        }
    ]);
})(jQuery);