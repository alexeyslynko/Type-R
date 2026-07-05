import { Collection } from '../collection';
import { Model } from '../model';
export type CollectionReference = (() => Collection) | Collection | string;
export declare function parseReference(collectionRef: CollectionReference): (root: Model) => Collection;
