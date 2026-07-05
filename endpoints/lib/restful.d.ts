import { IOEndpoint, IOOptions, Transactional } from '@type-r/models';
import { MemoryEndpoint } from './memory';
import { WebSocketEndpoint, WebSocketEndpointOptions } from './websocket';
export type UrlTemplate = (options: any, model?: any) => string;
export declare function create(url: string | UrlTemplate, fetchOptions?: Partial<RestfulFetchOptions>): RestfulEndpoint;
export { create as restfulIO };
export declare function restfulWebsocketIO(url: string | UrlTemplate, websocketUrl: string, options?: RestfulWebSocketEndpointOptions): RestfulWebSocketEndpoint;
export type HttpMethod = 'GET' | 'POST' | 'UPDATE' | 'DELETE' | 'PUT';
export interface RestfulIOOptions extends IOOptions {
    params?: object;
    options?: RequestInit;
    idempotencyKey?: string;
    expectedVersion?: string | number;
}
export type RestfulFetchOptions = {
    cache?: RequestCache;
    credentials?: RequestCredentials;
    mode?: RequestMode;
    redirect?: RequestRedirect;
    referrerPolicy?: ReferrerPolicy;
    mockData?: any;
    simulateDelay?: number;
};
export type RestfulWebSocketEndpointOptions = Partial<RestfulFetchOptions> & WebSocketEndpointOptions;
export declare class RestfulEndpoint implements IOEndpoint {
    url: string | UrlTemplate;
    constructor(url: string | UrlTemplate, { mockData, simulateDelay, ...fetchOptions }?: RestfulFetchOptions);
    fetchOptions: RestfulFetchOptions;
    memoryIO: MemoryEndpoint;
    static defaultFetchOptions: RestfulFetchOptions;
    create(json: any, options: RestfulIOOptions, model: any): Promise<any>;
    update(id: any, json: any, options: RestfulIOOptions, model: any): Promise<any>;
    read(id: any, options: IOOptions, model: any): Promise<any>;
    destroy(id: any, options: RestfulIOOptions, model: any): Promise<any>;
    list(options: RestfulIOOptions, collection: any): Promise<any>;
    subscribe(events: any): any;
    unsubscribe(events: any): any;
    simulateIO(method: string, httpMethod: string, url: string, args: any): Promise<any>;
    protected objectUrl(model: Transactional, id: string, options?: RestfulIOOptions): string;
    protected collectionUrl(collection: Transactional, options?: RestfulIOOptions): string;
    protected buildRequestOptions(method: string, options?: RequestInit, body?: any): RequestInit;
    protected request(method: HttpMethod, url: string, ioOptions: RestfulIOOptions, body?: any): Promise<any>;
}
export declare class RestfulWebSocketEndpoint implements IOEndpoint {
    options: RestfulWebSocketEndpointOptions;
    restful: RestfulEndpoint;
    websocket: WebSocketEndpoint;
    constructor(url: string | UrlTemplate, websocketUrl: string, options?: RestfulWebSocketEndpointOptions);
    create(json: any, options: RestfulIOOptions, model: any): Promise<any>;
    update(id: any, json: any, options: RestfulIOOptions, model: any): Promise<any>;
    read(id: any, options: IOOptions, model: any): Promise<any>;
    destroy(id: any, options: RestfulIOOptions, model: any): Promise<any>;
    list(options: RestfulIOOptions, collection: any): Promise<any>;
    subscribe(events: any, collection?: any): import("@type-r/models").IOPromise<any>;
    unsubscribe(events: any, collection?: any): void;
}
export declare class UrlBuilder {
    private url;
    static from(url: string | UrlTemplate, object: Transactional, options?: RestfulIOOptions): UrlBuilder;
    constructor(url: string);
    modelId(model: Transactional): UrlBuilder;
    append(id: string): UrlBuilder;
    params(params: object): UrlBuilder;
    toString(): string;
}
