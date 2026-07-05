import { createIOPromise } from '@type-r/models';
export function websocketIO(url, options) {
    if (options === void 0) { options = {}; }
    return new WebSocketEndpoint(url, options);
}
var WebSocketEndpoint = (function () {
    function WebSocketEndpoint(url, options) {
        if (options === void 0) { options = {}; }
        this.url = url;
        this.options = options;
        this.WebSocket = options.WebSocket || getGlobalWebSocket();
        this.connection = SharedWebSocketConnection.get(url, this.WebSocket, options.protocols);
    }
    WebSocketEndpoint.prototype.list = function (options, collection) {
        return notSupported('list');
    };
    WebSocketEndpoint.prototype.create = function (json, options, record) {
        return notSupported('create');
    };
    WebSocketEndpoint.prototype.update = function (id, json, options, record) {
        return notSupported('update');
    };
    WebSocketEndpoint.prototype.read = function (id, options, record) {
        return notSupported('read');
    };
    WebSocketEndpoint.prototype.destroy = function (id, options, record) {
        return notSupported('destroy');
    };
    WebSocketEndpoint.prototype.subscribe = function (events, collection) {
        var _this = this;
        return createIOPromise(function (resolve, reject, onAbort) {
            var subscription = {
                endpoint: _this,
                events: events,
                collection: collection,
                resolve: resolve,
                reject: reject,
                opened: false
            };
            _this.connection.subscribe(subscription);
            onAbort(function (resolve, reject) {
                _this.unsubscribe(events, collection);
                reject(new Error('I/O Aborted'));
            });
        });
    };
    WebSocketEndpoint.prototype.unsubscribe = function (events, collection) {
        this.connection.unsubscribe(this, events, collection);
    };
    WebSocketEndpoint.prototype.getMessage = function (message, collection) {
        return typeof message === 'function' ? message(collection) : message;
    };
    WebSocketEndpoint.prototype.sendMessage = function (socket, message) {
        if (message !== void 0) {
            socket.send(JSON.stringify(message));
        }
    };
    WebSocketEndpoint.prototype.parseMessage = function (event) {
        var data = event.data;
        return typeof data === 'string' ? JSON.parse(data) : data;
    };
    WebSocketEndpoint.prototype.acceptsMessage = function (message, collection) {
        if (this.options.match && !this.options.match(message, collection))
            return false;
        return true;
    };
    WebSocketEndpoint.prototype.handleMessage = function (events, message, collection) {
        if (!this.acceptsMessage(message, collection))
            return;
        if (message.updated !== void 0) {
            events.updated && events.updated(message.updated);
            return;
        }
        if (message.removed !== void 0) {
            events.removed && events.removed(getRemovedId(message.removed));
            return;
        }
        var type = message.type || message.event || message.action, payload = message.payload !== void 0 ? message.payload : message.data;
        if (isUpdatedEvent(type)) {
            events.updated && events.updated(payload);
        }
        else if (isRemovedEvent(type)) {
            events.removed && events.removed(getRemovedId(payload));
        }
    };
    return WebSocketEndpoint;
}());
export { WebSocketEndpoint };
var SharedWebSocketConnection = (function () {
    function SharedWebSocketConnection(url, WebSocket, protocols) {
        this.url = url;
        this.WebSocket = WebSocket;
        this.protocols = protocols;
        this.subscriptions = [];
        this.closing = false;
    }
    SharedWebSocketConnection.get = function (url, WebSocket, protocols) {
        var existing = this.connections.filter(function (connection) {
            return connection.url === url &&
                connection.WebSocket === WebSocket &&
                protocolsKey(connection.protocols) === protocolsKey(protocols);
        })[0];
        if (existing)
            return existing;
        var connection = new SharedWebSocketConnection(url, WebSocket, protocols);
        this.connections.push(connection);
        return connection;
    };
    SharedWebSocketConnection.prototype.subscribe = function (subscription) {
        this.subscriptions.push(subscription);
        this.connect();
        if (this.isOpen()) {
            this.activate(subscription);
        }
    };
    SharedWebSocketConnection.prototype.unsubscribe = function (endpoint, events, collection) {
        var subscription = this.subscriptions.filter(function (x) {
            return x.endpoint === endpoint && x.events === events && x.collection === collection;
        })[0];
        if (subscription) {
            if (subscription.opened && this.isOpen()) {
                endpoint.sendMessage(this.socket, endpoint.getMessage(endpoint.options.unsubscribeMessage, collection));
            }
            else {
                subscription.reject(new Error('WebSocket connection closed before subscription was established.'));
            }
            this.remove(subscription);
            this.closeIfUnused();
        }
    };
    SharedWebSocketConnection.prototype.connect = function () {
        var _this = this;
        if (this.socket)
            return;
        this.closing = false;
        var socket = this.socket = new this.WebSocket(this.url, this.protocols);
        socket.onopen = function () {
            _this.subscriptions.slice().forEach(function (subscription) { return _this.activate(subscription); });
        };
        socket.onmessage = function (event) {
            var parsed = new EndpointMessageCache(event);
            _this.subscriptions.slice().forEach(function (subscription) {
                return subscription.endpoint.handleMessage(subscription.events, parsed.get(subscription.endpoint), subscription.collection);
            });
        };
        socket.onerror = function (event) {
            _this.subscriptions.slice().forEach(function (subscription) {
                if (!subscription.opened) {
                    subscription.reject(getWebSocketError(event));
                    _this.remove(subscription);
                }
            });
            _this.closeIfUnused();
        };
        socket.onclose = function () {
            var subscriptions = _this.subscriptions.slice();
            subscriptions.forEach(function (subscription) {
                if (!subscription.opened) {
                    subscription.reject(new Error('WebSocket connection closed before subscription was established.'));
                }
                _this.remove(subscription);
            });
            _this.cleanupSocket();
            _this.unregister();
        };
    };
    SharedWebSocketConnection.prototype.activate = function (subscription) {
        if (this.subscriptions.indexOf(subscription) < 0 || subscription.opened)
            return;
        subscription.opened = true;
        subscription.endpoint.sendMessage(this.socket, subscription.endpoint.getMessage(subscription.endpoint.options.subscribeMessage, subscription.collection));
        subscription.resolve(subscription);
    };
    SharedWebSocketConnection.prototype.remove = function (subscription) {
        this.subscriptions = this.subscriptions.filter(function (x) { return x !== subscription; });
    };
    SharedWebSocketConnection.prototype.closeIfUnused = function () {
        if (this.socket && !this.subscriptions.length) {
            this.closing = true;
            this.socket.close();
            this.cleanupSocket();
            this.unregister();
        }
    };
    SharedWebSocketConnection.prototype.cleanupSocket = function () {
        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;
            this.socket = null;
        }
    };
    SharedWebSocketConnection.prototype.isOpen = function () {
        return this.socket && (this.socket.readyState === void 0 || this.socket.readyState === 1);
    };
    SharedWebSocketConnection.prototype.unregister = function () {
        var _this = this;
        var constructor = this.constructor;
        constructor.connections = constructor.connections.filter(function (connection) { return connection !== _this; });
    };
    SharedWebSocketConnection.connections = [];
    return SharedWebSocketConnection;
}());
var EndpointMessageCache = (function () {
    function EndpointMessageCache(event) {
        this.event = event;
        this.cache = [];
    }
    EndpointMessageCache.prototype.get = function (endpoint) {
        var entry = this.cache.filter(function (x) { return x.endpoint === endpoint; })[0];
        if (entry)
            return entry.message;
        var message = endpoint.parseMessage(this.event);
        this.cache.push({ endpoint: endpoint, message: message });
        return message;
    };
    return EndpointMessageCache;
}());
function isUpdatedEvent(type) {
    return ['updated', 'update', 'created', 'create', 'upsert'].indexOf(type) >= 0;
}
function isRemovedEvent(type) {
    return ['removed', 'remove', 'deleted', 'delete', 'destroyed', 'destroy'].indexOf(type) >= 0;
}
function getRemovedId(payload) {
    return payload && typeof payload === 'object' && payload.id !== void 0 ? payload.id : payload;
}
function notSupported(method) {
    return createIOPromise(function (resolve, reject) {
        reject(new Error("WebSocketEndpoint does not support ".concat(method, "().")));
    });
}
function getWebSocketError(event) {
    return event instanceof Error ? event : new Error('WebSocket connection failed.');
}
function getGlobalWebSocket() {
    if (typeof WebSocket !== 'undefined')
        return WebSocket;
    throw new Error('WebSocket constructor is not available. Pass it in WebSocketEndpointOptions.WebSocket.');
}
function protocolsKey(protocols) {
    return Array.isArray(protocols) ? protocols.join('\n') : protocols || '';
}
//# sourceMappingURL=websocket.js.map