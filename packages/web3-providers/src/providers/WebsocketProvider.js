/*
    This file is part of web3.js.

    web3.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    web3.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with web3.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file WebsocketProvider.js
 * @authors: Fabian Vogelsteller <fabian@ethereum.org>
 * @date 2017
 */

import EventEmitter from 'eventemitter3';

export default class WebsocketProvider extends EventEmitter {
    /**
     * Default connection ws://localhost:8546
     *
     * @param {String} url
     * @param {Object} options
     *
     * @constructor
     */
    constructor(url, options) {
        super();
        this.options = options || {};
        this.url = url;
        this._customTimeout = this.options.timeout || undefined;
        this.connect(this.url, this.options);
    }

    /**
     * Note: The w3cwebsocket implementation does not support Basic Auth
     * username/password in the URL. So generate the basic auth header, and
     * pass through with any additional headers supplied in constructor
     *
     * Returns a connected WebSocket instance from the given url
     *
     * @method connect
     *
     * @param {String} url
     * @param {Object} options
     *
     * @returns {Ws}
     */
    connect(url, options) {
        const parsedURL = parseURL(url),
              headers = options.headers || {},
              protocol = options.protocol,
              clientConfig = options.clientConfig;

        let authToken;
        if (parsedURL.username && parsedURL.password) {
            authToken = Buffer.from(`${parsedURL.username}:${parsedURL.password}`, 'base64');
            headers.authorization = `Basic ${authToken}`;
        }


        if (parsedURL.auth) {
            authToken = Buffer.from(parsedURL.auth, 'base64');
        }

        headers.authorization = authToken;

        this.connection = new Ws(url, protocol, undefined, headers, undefined, clientConfig);
        this.connection.addEventListener('open', this.onOpen);
        this.connection.addEventListener('message', this.onMessage);
        this.connection.addEventListener('error', this.onError);
        this.connection.addEventListener('close', this.onClose);
        this.connection.addEventListener('connect', this.onConnect);
    }

    /**
     * Emits the open event with the event the provider got from the WebSocket connection.
     *
     * @method onOpen
     *
     * @param {Event} event
     */
    onOpen(event) {
        this.emit('open', event);
    }

    /**
     * This is the listener for the 'message' event from the WebSocket connection.
     *
     * @method onMessage
     *
     * @param {MessageEvent} messageEvent
     */
    onMessage(messageEvent) {
        this.parseResponse(messageEvent.data).forEach(result => {
            if (result.method && result.method.indexOf('_subscription') !== -1) {
                this.emit(result.params.subscription, result);

                return;
            }

            let id = null;
            if (isArray(result)) {
                id = result[0].id;
            } else {
                id = result.id;
            }

            this.emit(`response_${id}`, result);
            this.removeAllListeners(`response_${id}`);
        });
    }

    /**
     * Emits the error event and clears the connection before.
     *
     * @method onError
     *
     * @param {Event} error
     */
    onError(error) {
        this.clear();
        this.emit('error', error);
    }

    /**
     * Emits the close event and clears the connection before.
     *
     * @method onClose
     */
    onClose() {
        this.clear();
        this.emit('close');
    }

    /**
     * Emits the connect event.
     *
     * @method onConnect
     */
    onConnect() {
        this.emit('connect');
    }

    /**
     * Will parse the response and make an array out of it.
     *
     * @method parseResponse
     *
     * @param {String} data
     */
    parseResponse(data) {
        const returnValues = [],
              dechunkedData = data
                .replace(/\}[\n\r]?\{/g, '}|--|{') // }{
                .replace(/\}\][\n\r]?\[\{/g, '}]|--|[{') // }][{
                .replace(/\}[\n\r]?\[\{/g, '}|--|[{') // }[{
                .replace(/\}\][\n\r]?\{/g, '}]|--|{') // }]{
                .split('|--|');

        dechunkedData.forEach(data => {
            let result = null;

            // prepend the last chunk
            if (this.lastChunk) {
                data = this.lastChunk + data;
            }

            try {
                result = JSON.parse(data);
            } catch (error) {
                this.lastChunk = data;

                return;
            }

            this.lastChunk = null;

            if (result) {
                returnValues.push(result);
            }
        });

        return returnValues;
    }

    /**
     * Sends the JSON-RPC request
     *
     * @method send
     *
     * @param {Object} payload
     *
     * @returns {Promise<any>}
     */
    send(payload) {
        return new Promise((resolve, reject) => {
            if (this.connection.readyState !== this.connection.OPEN) {
                reject('Connection error: Connection is not open on send()');
            }

            if (!this.isConnecting()) {
                this.connection.send(JSON.stringify(payload));

                this.on(`response_${payload.id}`, response => {
                    this.removeAllListeners(`response_${payload.id}`);
                    return resolve(response);
                });

                return;
            }

            setTimeout(() => {
                if (!this.isConnecting()) {
                    this.connection.send(JSON.stringify(payload));

                    this.on(`response_${payload.id}`, response => {
                        this.removeAllListeners(`response_${payload.id}`);
                        return resolve(response);
                    });
                }
            }, 500);
        });
    }

    /**
     * Resets the providers, clears all callbacks
     *
     * @method reset
     *
     * @callback callback callback(error, result)
     */
    reset() {
        this.clear();
        this.connect(this.url, this.options);
    }

    /**
     * Removes all listeners on the EventEmitter and the WebSocket object.
     *
     * @method removeAllListeners
     *
     * @param {String} event
     */
    removeAllListeners(event) {
        this.connection.removeAllListeners(event);
        super.removeAllListeners(event);
    }

    /**
     * Removes all listeners, notificationCallbacks and responseCallbacks
     *
     * @method clear
     */
    clear() {
        this.removeAllListeners('error');
        this.removeAllListeners('end');
        this.removeAllListeners('data');
    }

    /**
     * Will close the WebSocket connection with a error code and reason.
     * Please have a look at https://developer.mozilla.org/de/docs/Web/API/WebSocket/close
     * for further information.
     *
     * @method disconnect
     *
     * @param {Number} code
     * @param {String} reason
     */
    disconnect(code, reason) {
        if (this.connection) {
            this.connection.close(code, reason);
        }
    }

    /**
     * Returns true if the socket connection state is OPEN
     *
     * @property connected
     *
     * @returns {Boolean}
     */
    get connected() {
        return this.connection && this.connection.readyState === this.connection.OPEN;
    }

    /**
     * Returns if the socket connection is in the connecting state.
     *
     * @method isConnecting
     *
     * @returns {Boolean}
     */
    isConnecting() {
        return this.connection.readyState === this.connection.CONNECTING;
    }
}