import { IOEndpoint, IOOptions, IOPromise, createIOPromise } from '@type-r/models'

export function websocketIO( url : string, options : WebSocketEndpointOptions = {} ){
    return new WebSocketEndpoint( url, options );
}

export type WebSocketMessageType =
    'updated' | 'update' | 'created' | 'create' | 'upsert' |
    'removed' | 'remove' | 'deleted' | 'delete' | 'destroyed' | 'destroy'

export interface WebSocketEndpointOptions {
    WebSocket? : WebSocketConstructor
    protocols? : string | string[]
    parse? : ( event : MessageEvent ) => any
    serialize? : ( message : any ) => string
    match? : ( message : any, collection? : any ) => boolean
    subscribeMessage? : object | ( ( collection? : any ) => any )
    unsubscribeMessage? : object | ( ( collection? : any ) => any )
}

export interface WebSocketConstructor {
    new ( url : string, protocols? : string | string[] ) : WebSocketLike
}

export interface WebSocketLike {
    onopen : ( ( event? : any ) => void ) | null
    onmessage : ( ( event : MessageEvent ) => void ) | null
    onerror : ( ( event? : any ) => void ) | null
    onclose : ( ( event? : any ) => void ) | null
    readyState? : number
    send( data : string ) : void
    close() : void
}

interface Subscription {
    endpoint : WebSocketEndpoint
    events : any
    collection : any
    resolve : ( value? : any ) => void
    reject : ( error? : any ) => void
    opened : boolean
}

export class WebSocketEndpoint implements IOEndpoint {
    private WebSocket : WebSocketConstructor
    private connection : SharedWebSocketConnection

    constructor( public url : string, public options : WebSocketEndpointOptions = {} ){
        this.WebSocket = options.WebSocket || getGlobalWebSocket();
        this.connection = SharedWebSocketConnection.get( url, this.WebSocket, options.protocols );
    }

    list( options : IOOptions, collection? ) : IOPromise<any> {
        return notSupported( 'list' );
    }

    create( json : any, options : IOOptions, record? ) : IOPromise<any> {
        return notSupported( 'create' );
    }

    update( id : string | number, json : any, options : IOOptions, record? ) : IOPromise<any> {
        return notSupported( 'update' );
    }

    read( id : string | number, options : IOOptions, record? ) : IOPromise<any> {
        return notSupported( 'read' );
    }

    destroy( id : string | number, options : IOOptions, record? ) : IOPromise<any> {
        return notSupported( 'destroy' );
    }

    subscribe( events, collection? ) : IOPromise<any> {
        return createIOPromise( ( resolve, reject, onAbort ) => {
            const subscription : Subscription = {
                endpoint : this,
                events,
                collection,
                resolve,
                reject,
                opened : false
            };

            this.connection.subscribe( subscription );

            onAbort( ( resolve, reject ) => {
                this.unsubscribe( events, collection );
                reject( new Error( 'I/O Aborted' ) );
            });
        });
    }

    unsubscribe( events, collection? ) : void {
        this.connection.unsubscribe( this, events, collection );
    }

    getMessage( message, collection ){
        return typeof message === 'function' ? message( collection ) : message;
    }

    sendMessage( socket : WebSocketLike, message ){
        if( message !== void 0 ) {
            socket.send( this.serialize( message ) );
        }
    }

    private serialize( message ){
        return this.options.serialize ? this.options.serialize( message ) : JSON.stringify( message );
    }

    parseMessage( event : MessageEvent ){
        if( this.options.parse ) return this.options.parse( event );

        const { data } = event;
        return typeof data === 'string' ? JSON.parse( data ) : data;
    }

    acceptsMessage( message, collection? ){
        if( this.options.match && !this.options.match( message, collection ) ) return false;
        return true;
    }

    handleMessage( events, message, collection? ){
        if( !this.acceptsMessage( message, collection ) ) return;

        if( message.updated !== void 0 ) {
            events.updated && events.updated( message.updated );
            return;
        }

        if( message.removed !== void 0 ) {
            events.removed && events.removed( getRemovedId( message.removed ) );
            return;
        }

        const type = message.type || message.event || message.action,
            payload = message.payload !== void 0 ? message.payload : message.data;

        if( isUpdatedEvent( type ) ) {
            events.updated && events.updated( payload );
        }
        else if( isRemovedEvent( type ) ) {
            events.removed && events.removed( getRemovedId( payload ) );
        }
    }
}

class SharedWebSocketConnection {
    private static connections : SharedWebSocketConnection[] = []

    static get( url : string, WebSocket : WebSocketConstructor, protocols? : string | string[] ){
        const existing = this.connections.filter( connection =>
            connection.url === url &&
            connection.WebSocket === WebSocket &&
            protocolsKey( connection.protocols ) === protocolsKey( protocols )
        )[ 0 ];

        if( existing ) return existing;

        const connection = new SharedWebSocketConnection( url, WebSocket, protocols );
        this.connections.push( connection );
        return connection;
    }

    private socket : WebSocketLike
    private subscriptions : Subscription[] = []
    private closing = false

    constructor(
        public url : string,
        public WebSocket : WebSocketConstructor,
        public protocols? : string | string[]
    ){}

    subscribe( subscription : Subscription ){
        this.subscriptions.push( subscription );
        this.connect();

        if( this.isOpen() ) {
            this.activate( subscription );
        }
    }

    unsubscribe( endpoint : WebSocketEndpoint, events, collection? ){
        const subscription = this.subscriptions.filter( x =>
            x.endpoint === endpoint && x.events === events && x.collection === collection
        )[ 0 ];

        if( subscription ) {
            if( subscription.opened && this.isOpen() ) {
                endpoint.sendMessage( this.socket, endpoint.getMessage( endpoint.options.unsubscribeMessage, collection ) );
            }
            else {
                subscription.reject( new Error( 'WebSocket connection closed before subscription was established.' ) );
            }

            this.remove( subscription );
            this.closeIfUnused();
        }
    }

    private connect(){
        if( this.socket ) return;

        this.closing = false;
        const socket = this.socket = new this.WebSocket( this.url, this.protocols );

        socket.onopen = () => {
            this.subscriptions.slice().forEach( subscription => this.activate( subscription ) );
        };

        socket.onmessage = event => {
            const parsed = new EndpointMessageCache( event );

            this.subscriptions.slice().forEach( subscription =>
                subscription.endpoint.handleMessage(
                    subscription.events,
                    parsed.get( subscription.endpoint ),
                    subscription.collection
                )
            );
        };

        socket.onerror = event => {
            this.subscriptions.slice().forEach( subscription => {
                if( !subscription.opened ) {
                    subscription.reject( getWebSocketError( event ) );
                    this.remove( subscription );
                }
            });

            this.closeIfUnused();
        };

        socket.onclose = () => {
            const subscriptions = this.subscriptions.slice();

            subscriptions.forEach( subscription => {
                if( !subscription.opened ) {
                    subscription.reject( new Error( 'WebSocket connection closed before subscription was established.' ) );
                }

                this.remove( subscription );
            });

            this.cleanupSocket();
            this.unregister();
        };
    }

    private activate( subscription : Subscription ){
        if( this.subscriptions.indexOf( subscription ) < 0 || subscription.opened ) return;

        subscription.opened = true;
        subscription.endpoint.sendMessage(
            this.socket,
            subscription.endpoint.getMessage( subscription.endpoint.options.subscribeMessage, subscription.collection )
        );
        subscription.resolve( subscription );
    }

    private remove( subscription : Subscription ){
        this.subscriptions = this.subscriptions.filter( x => x !== subscription );
    }

    private closeIfUnused(){
        if( this.socket && !this.subscriptions.length ) {
            this.closing = true;
            this.socket.close();
            this.cleanupSocket();
            this.unregister();
        }
    }

    private cleanupSocket(){
        if( this.socket ) {
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;
            this.socket = null;
        }
    }

    private isOpen(){
        return this.socket && ( this.socket.readyState === void 0 || this.socket.readyState === 1 );
    }

    private unregister(){
        const constructor = this.constructor as typeof SharedWebSocketConnection;
        constructor.connections = constructor.connections.filter( connection => connection !== this );
    }
}

class EndpointMessageCache {
    private cache : { endpoint : WebSocketEndpoint, message : any }[] = []

    constructor( private event : MessageEvent ){}

    get( endpoint : WebSocketEndpoint ){
        const entry = this.cache.filter( x => x.endpoint === endpoint )[ 0 ];
        if( entry ) return entry.message;

        const message = endpoint.parseMessage( this.event );
        this.cache.push({ endpoint, message });
        return message;
    }
}

function isUpdatedEvent( type : WebSocketMessageType ){
    return [ 'updated', 'update', 'created', 'create', 'upsert' ].indexOf( type ) >= 0;
}

function isRemovedEvent( type : WebSocketMessageType ){
    return [ 'removed', 'remove', 'deleted', 'delete', 'destroyed', 'destroy' ].indexOf( type ) >= 0;
}

function getRemovedId( payload ){
    return payload && typeof payload === 'object' && payload.id !== void 0 ? payload.id : payload;
}

function notSupported( method : string ) : IOPromise<any> {
    return createIOPromise( ( resolve, reject ) => {
        reject( new Error( `WebSocketEndpoint does not support ${method}().` ) );
    });
}

function getWebSocketError( event ){
    return event instanceof Error ? event : new Error( 'WebSocket connection failed.' );
}

function getGlobalWebSocket() : WebSocketConstructor {
    if( typeof WebSocket !== 'undefined' ) return WebSocket as any;

    throw new Error( 'WebSocket constructor is not available. Pass it in WebSocketEndpointOptions.WebSocket.' );
}

function protocolsKey( protocols : string | string[] ){
    return Array.isArray( protocols ) ? protocols.join( '\n' ) : protocols || '';
}
