import { IOEndpoint, IOOptions, IOPromise } from '@type-r/models';
export declare function websocketIO(url: string, options?: WebSocketEndpointOptions): WebSocketEndpoint;
export type WebSocketMessageType = 'updated' | 'update' | 'created' | 'create' | 'upsert' | 'removed' | 'remove' | 'deleted' | 'delete' | 'destroyed' | 'destroy';
export interface WebSocketEndpointOptions {
    WebSocket?: WebSocketConstructor;
    protocols?: string | string[];
    parse?: (event: MessageEvent) => any;
    serialize?: (message: any) => string;
    match?: (message: any, collection?: any) => boolean;
    subscribeMessage?: object | ((collection?: any) => any);
    unsubscribeMessage?: object | ((collection?: any) => any);
}
export interface WebSocketConstructor {
    new (url: string, protocols?: string | string[]): WebSocketLike;
}
export interface WebSocketLike {
    onopen: ((event?: any) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event?: any) => void) | null;
    onclose: ((event?: any) => void) | null;
    readyState?: number;
    send(data: string): void;
    close(): void;
}
export declare class WebSocketEndpoint implements IOEndpoint {
    url: string;
    options: WebSocketEndpointOptions;
    private WebSocket;
    private connection;
    constructor(url: string, options?: WebSocketEndpointOptions);
    list(options: IOOptions, collection?: any): IOPromise<any>;
    create(json: any, options: IOOptions, record?: any): IOPromise<any>;
    update(id: string | number, json: any, options: IOOptions, record?: any): IOPromise<any>;
    read(id: string | number, options: IOOptions, record?: any): IOPromise<any>;
    destroy(id: string | number, options: IOOptions, record?: any): IOPromise<any>;
    subscribe(events: any, collection?: any): IOPromise<any>;
    unsubscribe(events: any, collection?: any): void;
    getMessage(message: any, collection: any): any;
    sendMessage(socket: WebSocketLike, message: any): void;
    private serialize;
    parseMessage(event: MessageEvent): any;
    acceptsMessage(message: any, collection?: any): boolean;
    handleMessage(events: any, message: any, collection?: any): void;
}
