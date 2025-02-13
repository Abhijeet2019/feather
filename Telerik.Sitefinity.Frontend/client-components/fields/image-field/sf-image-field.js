﻿(function ($) {
    var sfFields = angular.module('sfFields');
    sfFields.requires.push('sfImageField');

    angular.module('sfImageField', ['sfServices', 'sfImageSelector'])
        .directive('sfImageField', ['serverContext', 'sfMediaService', 'sfMediaFilter', function (serverContext, sfMediaService, sfMediaFilter) {
            return {
                restrict: "AE",
                scope: {
                    sfModel: '=',
                    sfImage: '=?',
                    sfProvider: '=?',
                    sfAutoOpenSelector: '@',
                    sfMediaSettings: '=?'
                },
                templateUrl: function (elem, attrs) {
                    var assembly = attrs.sfTemplateAssembly || 'Telerik.Sitefinity.Frontend';
                    var url = attrs.sfTemplateUrl || 'client-components/fields/image-field/sf-image-field.sf-cshtml';
                    return serverContext.getEmbeddedResourceUrl(assembly, url);
                },
                link: function (scope, element, attrs, ctrl) {
                    var guidEmpty = "00000000-0000-0000-0000-000000000000";
                    scope.guidEmpty = guidEmpty;
                    var autoOpenSelector = attrs.sfAutoOpenSelector !== undefined && attrs.sfAutoOpenSelector.toLowerCase() !== 'false';

                    var getDateFromString = function (dateStr) {
                        return (new Date(parseInt(dateStr.substring(dateStr.indexOf('Date(') + 'Date('.length, dateStr.indexOf(')')))));
                    };

                    var getImage = function (id) {
                        sfMediaService.images.getById(id, scope.sfProvider).then(function (dataCtx) {
                            if (dataCtx && dataCtx.Item) {
                                refreshScopeInfo(dataCtx);
                            }
                        });
                    };

                    var refreshScopeInfo = function (dataCtx) {
                        var item = dataCtx.Item;
                        scope.sfImage = item;
                        var isVectorGraphics = false;
                        if (dataCtx.SfAdditionalInfo) {
                            var isVectorGraphicsItems = $.grep(dataCtx.SfAdditionalInfo, function (e) { return e.Key === "IsVectorGraphics"; });
                            if (isVectorGraphicsItems.length == 1) {
                                isVectorGraphics = isVectorGraphicsItems[0].Value;
                            }
                        }
                        scope.sfImage.IsVectorGraphics = isVectorGraphics;
                        scope.sfImageIsVisible = scope.sfImage.ThumbnailUrl && scope.sfImage.ThumbnailUrl !== "";
                        scope.imageSize = Math.ceil(item.TotalSize / 1024) + " KB";
                        scope.uploaded = getDateFromString(item.DateCreated);
                    };

                    scope.showEditPropertiesButton = (window && window.radopen);

                    var editDialog;
                    var editAllPropertiesUrl = serverContext.getRootedUrl('/Sitefinity/Dialog/ContentViewEditDialog?ControlDefinitionName=ImagesBackend&ViewName=ImagesBackendEdit&IsInlineEditingMode=true');

                    var createDialog = function (dialogManager) {
                        editWindow = window.radopen(editAllPropertiesUrl);
                        var dialogName = editWindow.get_name();
                        var dialog = dialogManager.getDialogByName(dialogName);
                        dialog.add_close(closeEditAllProperties);

                        return dialog;
                    };

                    var getDialogContext = function (dialog, parentId) {
                        var itemsList = {};
                        itemsList.getBinder = function () {
                            var binder = {};
                            binder.get_provider = function () {
                                return scope.sfProvider;
                            };
                            return binder;
                        };

                        var dialogContext = {
                            commandName: 'edit',
                            itemsList: itemsList,
                            dataItem: {
                                Id: scope.sfImage.Id,
                                ProviderName: scope.sfProvider
                            },
                            dialog: dialog,
                            params: {
                                IsEditable: true,
                                parentId: parentId
                            },
                            key: { Id: scope.sfImage.Id },
                            commandArgument: { languageMode: 'edit', language: serverContext.getUICulture() }
                        };

                        return dialogContext;
                    };

                    var closeEditAllProperties = function (sender, args) {
                        if (args && args.get_argument() && args.get_argument() == 'rebind') {
                            getImage(scope.sfModel);
                        }
                        sender.remove_close(closeEditAllProperties);
                    };

                    var forceAngularJsDigest = function () {
                        scope.$digest();

                        document.removeEventListener("forceAngularJsDigest", forceAngularJsDigest);
                    };

                    var getCultureFromUrl = function () {
                        var editSegment = "Edit/";
                        var path = this.window.location.pathname;
                        var culture = path.substr(path.indexOf(editSegment) + editSegment.length);
                        return culture;
                    };

                    scope.editAllProperties = function () {
                        var parentId = scope.sfImage.ParentId || scope.sfImage.Album.Id;

                        var isAdminAppActive = window.location.pathname.toLowerCase().includes("adminapp");

                        if (isAdminAppActive) {
                            var irisEvent = new CustomEvent("openIrisContent", {
                                detail: {
                                    parentId: parentId,
                                    itemId: scope.sfImage.OriginalContentId,
                                    mediaType: "images",
                                    provider: scope.sfProvider,
                                    culture: serverContext.getUICulture() || getCultureFromUrl()
                                }
                            });
                            document.dispatchEvent(irisEvent);

                            document.addEventListener("forceAngularJsDigest", forceAngularJsDigest);
                        } else {
                            var fullEditAllPropertiesUrl = editAllPropertiesUrl + ('&parentId=' + parentId);

                            var dialogManager = window.top.GetDialogManager();
                            editDialog = createDialog(dialogManager);
                            editDialog.setUrl(fullEditAllPropertiesUrl);

                            var dialogName = editDialog.get_name();
                            var dialogContext = getDialogContext(editDialog, parentId);

                            dialogManager.openDialog(dialogName, null, dialogContext);
                        }                       
                    };

                    scope.done = function () {
                        scope.$uibModalInstance.close();

                        if (scope.model.selectedItems && scope.model.selectedItems.length) {
                            scope.sfProvider = scope.model.provider;

                            // Id is passed -> get image
                            getImage(scope.model.selectedItems[0].Id || scope.model.selectedItems[0]);
                        }
                    };

                    scope.cancel = function () {
                        // cancels the image properties if no image is selected
                        if (scope.sfModel === undefined) {
                            scope.sfModel = null;
                        }

                        scope.$uibModalInstance.dismiss();
                    };

                    scope.clearImage = function () {
                        scope.sfImage = null;
                        scope.sfProvider = null;
                        scope.sfImageIsVisible = false;
                    };

                    scope.changeImage = function () {
                        scope.model = {
                            selectedItems: [],
                            filterObject: null,
                            provider: scope.sfProvider
                        };

                        if (scope.sfImage && scope.sfImage.Id) {
                            scope.model.selectedItems.push(scope.sfImage);
                            scope.model.filterObject = sfMediaFilter.newFilter();
                            scope.model.filterObject.set.parent.to(scope.sfImage.FolderId || scope.sfImage.Album.Id);
                            scope.model.filterObject.status = attrs.sfMaster === 'true' || attrs.sfMaster === 'True' ? 'master' : 'live';
                        }

                        var imageSelectorModalScope = element.find('.imageSelectorModal').scope();

                        if (imageSelectorModalScope)
                            imageSelectorModalScope.$openModalDialog();
                    };

                    // Initialize
                    if (scope.sfModel && scope.sfModel !== guidEmpty) {
                        getImage(scope.sfModel);
                    }
                    else if (autoOpenSelector) {
                        scope.changeImage();
                    }

                    scope.$on('sf-image-selector-image-uploaded', function (event, uploadedImageInfo) {
                        if (!scope.model.provider && uploadedImageInfo.ContentItem && uploadedImageInfo.ContentItem.ProviderName) {
                            scope.model.provider = uploadedImageInfo.ContentItem.ProviderName;
                        }

                        scope.sfProvider = scope.model.provider;

                        getImage(uploadedImageInfo.ContentId);
                        scope.$uibModalInstance.dismiss();
                    });

                    scope.$watch('sfImage.Id', function (newVal) {
                        scope.sfModel = newVal;
                    });
                }
            };
        }]);
})(jQuery);
