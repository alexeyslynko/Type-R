import { Record } from '../record';
export declare class Store extends Record {
    getStore(): Store;
    get(name: string): any;
    static get global(): Store;
    static set global(store: Store);
}
