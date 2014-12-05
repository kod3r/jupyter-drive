// Copyright (c) IPython Development Team.
// Distributed under the terms of the Modified BSD License.

define(function(require) {

    var IPython = require('base/js/namespace');
    var $ = require('jquery');
    var dialog = require('base/js/dialog');
    var utils = require('base/js/utils');

    /**
     * OAuth scope for accessing specific files that have been opened/created
     * by this app.
     * @type {string}
     */
    var FILES_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';

    /**
     * OAuth scope for accessing file metadata (for tree view)
     * @type {string}
     */
    var METADATA_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly.metadata';

    /**
     * Helper functions
     */


    /**
     * Perform an authenticated download.
     * @param {string} url The download URL.
     * @return {Promise} resolved with the contents of the file, or rejected
     *     with an Error.
     */
    var download = function(url) {
        // Sends request to load file to drive.
        var token = gapi.auth.getToken().access_token;
        var settings = { headers: { 'Authorization': 'Bearer ' + token } };
        return utils.promising_ajax(url, settings);
    };

    /**
     * Wrap a Google API result as an Promise, which is immediate resolved
     * or rejected based on whether an error is detected.
     * @param {Object} result The result of a Google API call, as returned
     *     by a request.execute method.
     * @return {Promise} The result wrapped as a promise.
     */
    var wrap_result = function(result) {
        if (!result) {
            // Error type 1: result is False
            var error = new Error('Unknown error during Google API call');
            error.name = 'GapiError';
            return Promise.reject(error);
        } else if (result['error']) {
            // Error type 2: an error resource (see
            // https://developers.google.com/drive/web/handle-errors)
            var error = new Error(result['error']['message']);
            error.gapi_error = result['error'];
            return Promise.reject(error);
        } else {
            return Promise.resolve(result);
        }
    };

    /**
     * Executes a Google API request.  This wraps the request.execute() method,
     * by returning a Promise, which may be resolved or rejected.  The raw
     * return value of execute() has errors detected, and errors are wrapped as
     * an Error object.
     *
     * Typical usage:
     * var request = gapi.client.drive.files.get({
     *     'fileId': fileId
     * });
     * execute(request, succes, error);
     *
     * @param {Object} request The request, generated by the Google JavaScript
     *     client API.
     * @return {Promise} Fullfilled with the result on success, or the
     *     result wrapped as an Error on error.
     */
    var execute = function(request) {
        return new Promise(function(resolve, reject) {
            request.execute(function(result) {
                resolve(wrap_result(result));
            });
        });
    };

    /**
     * Authorization and Loading Google API
     *
     * Utilities for doing OAuth flow with the Google API.
     */

    /**
     * Utility method that polls for a condition to hold.
     * @param {Function} condition Function called with no args, that returns
     *     true when the condition is fullfilled
     * @param {Number} interval Polling interval in milliseconds
     * @return Promise fullfilled when condition holds
     */
    var poll = function(condition, interval) {
        return new Promise(function(resolve, reject) {
            var polling_function = function() {
                if (condition()) {
                    resolve();
                } else {
                    setTimeout(polling_function, interval);
                }
            };
            polling_function();
        });
    };

    /**
     * (Internal use only) Returns a promise that is fullfilled when client
     * library loads.
     * @return {Promise} empty value on success or error on failure.
     */
    var load_gapi_1 = function() {
        return Promise.resolve($.getScript('https://apis.google.com/js/client.js'))
        .then(function() {
            // poll every 100ms until window.gapi and gapi.client exist.
            return poll(function() { return !!(window.gapi && gapi.client); }, 100);
        }, utils.wrap_ajax_error);
    };

    /**
     * (Internal use only) Returns a promise fullfilled when client library
     * loads.
     */
    var load_gapi_2 = function(d) {
        return new Promise(function(resolve, reject) {
            gapi.load('auth:client,drive-realtime,drive-share', function() {
                gapi.client.load('drive', 'v2', resolve);
            });
        });
    };

    /**
     * Returns a promise fullfilled when the Google API has authorized.
     * @param {boolean} opt_withPopup If true, display popup without first
     *     trying to authorize without a popup.
     */
    var authorize = function(opt_withPopup) {
        var authorize_internal = function() {
            return new Promise(function(resolve, reject) {
                gapi.auth.authorize({
                    'client_id': '911569945122-tlvi6ucbj137ifhitpqpdikf3qo1mh9d.apps.googleusercontent.com',
                    'scope': [FILES_OAUTH_SCOPE, METADATA_OAUTH_SCOPE],
                    'immediate': !opt_withPopup
                }, function(result) {
                    resolve(wrap_result(result));
                });
            });
        };

        if (opt_withPopup) {
            return new Promise(function(resolve, reject) {
                // Gets user to initiate the authorization with a dialog,
                // to prevent popup blockers.
                var options = {
                    title: 'Authentication needed',
                    body: ('Accessing Google Drive requires authentication.  Click'
                        + ' ok to proceed.'),
                    buttons: {
                        'ok': { click : function() { resolve(authorize_internal()); },
                              },
                        'cancel': { click : reject }
                    }
                }
                dialog.modal(options);
            });
        } else {
            // Return result of authorize, trying again with withPopup=true
            // in case of failure.
            return authorize_internal().catch(function() {
                return authorize(true);
            });
        }
    };

    /**
     * Promise fullfilled when gapi is loaded, and authorization is complete.
     */
    var gapi_ready = load_gapi_1().then(load_gapi_2).then(authorize);

    var drive_utils = {
        download : download,
        execute : execute,
        gapi_ready : gapi_ready
    };

    return drive_utils;
});
