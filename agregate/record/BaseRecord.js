// @flow
import '../polyfill';
import uuid from 'uuid';
import {Cypher as C} from '../cypher';
import acceptsTransaction from '../util/acceptsTransaction';
import checkRecordExistence from '../util/checkRecordExistence';
import {Relation} from '../relation/';
import * as R from 'ramda';
import {v1 as neo4j} from 'neo4j-driver';
import {Connection} from '../connection';
import * as s from '../symbols';

export const reflections: WeakMap<BaseRecord, neo4j.types.Node> = new WeakMap();

type Query = ?{ [key: string]: any };

export class BaseRecord {
    static connection: Connection;
    get connection(): Connection { return this.constructor.connection }

    static __proxyProps: string[] = ['uuid', 'createdAt', 'updatedAt'];

    // $FlowFixMe
    static get [s.label](): string { return this.name }

    // $FlowFixMe
    get [s.label](): string { return this.constructor[s.label] }

    static indices: string[] = [];

    static register() {

        // $FlowFixMe
        this.connection.registerRecordClass(this, this[s.label], this.indices);
    }

    constructor(props: Object = {}, node?: neo4j.types.Node) {
        Object.assign(this, R.omit(this.constructor.__proxyProps, props));
        if (node) {// $FlowFixMe
            this[s.node] = node;
        }
    }

    beforeCreate() { }

    afterCreate() { }

    beforeUpdate() { }

    afterUpdate() { }

    beforeDestroy() { }

    afterDestroy() { }

    // $FlowFixMe
    get __isReflected(): boolean { return this[s.node] !== undefined }

    // $FlowFixMe
    set [s.node](node: ?neo4j.types.Node): void { node ? reflections.set(this, node) : reflections.delete(this); }

    // $FlowFixMe
    get [s.node](): neo4j.types.Node { return reflections.get(this); }

    // $FlowFixMe
    get uuid(): ?string { return R.path(['properties', 'uuid'], this[s.node] || {}) }

    // $FlowFixMe
    get createdAt(): ?string { return R.path(['properties', 'createdAt'], this[s.node] || {}) }

    // $FlowFixMe
    get updatedAt(): ?string { return R.path(['properties', 'updatedAt'], this[s.node] || {}) }

    // $FlowFixMe
    static [s.selfQuery](key: string, query: Query): C {
        return query

            // $FlowFixMe
            ? C.tag`(${C.raw(key)}:${C.raw(this[s.label])} {${C.literal(query)}})`

            // $FlowFixMe
            : C.tag`(${C.raw(key)}:${C.raw(this[s.label])})`
    }

    // $FlowFixMe
    [s.selfQuery](key: string, query?: Query) {
        checkRecordExistence(this)

        // $FlowFixMe
        return this.constructor[s.selfQuery](key, query || {uuid: this.uuid})
    }

    toJSON(): Object {
        return R.pipe(
            R.toPairs,
            R.reject(([, value]) =>
                value instanceof Relation ||
                value instanceof Function ||
                value === undefined
            ),
            R.fromPairs
        )({...this, uuid: this.uuid})
    }

    @acceptsTransaction
    async save() {
        const isUpdating = this.__isReflected;
        const transaction = this.connection;
        const tempRecord = Object.defineProperties(
            // $FlowFixMe
            new this.constructor({...this}, this[s.node]),
            {
                connection: {value: transaction, configurable: true}
            });
        Object.assign(tempRecord, this);

        Reflect.setPrototypeOf(tempRecord, this);

        await (isUpdating ? tempRecord.beforeUpdate() : tempRecord.beforeCreate())
        const entryName = 'entry';
        const requestContent = isUpdating

            // $FlowFixMe
            ? C.tag`MATCH ${tempRecord[s.selfQuery](entryName)}
                        SET ${C.raw(entryName)} += ${tempRecord.toJSON()}, ${C.raw(entryName)}.updatedAt = timestamp()`
            : C.tag`CREATE (${C.raw(entryName)}:${C.raw(tempRecord[s.label])})
                        SET ${C.raw(entryName)} += ${tempRecord.toJSON()},
                            ${C.raw(entryName)}.createdAt = timestamp(),
                            ${C.raw(entryName)}.updatedAt = timestamp(),
                            ${C.raw(entryName)}.uuid = ${uuid.v4()}`
        const [[entry]] = await transaction.query(C.tag`${requestContent} RETURN entry`)

        tempRecord[s.node] = entry[s.node];
        Object.assign(tempRecord, entry);
        await (isUpdating ? tempRecord.afterUpdate(transaction) : tempRecord.afterCreate(transaction))

        // $FlowFixMe
        this[s.node] = tempRecord[s.node];
        Object.assign(this, tempRecord);
        return this;
    }

    @acceptsTransaction
    async destroy() {
        if (!this.__isReflected) {return;}

        const transaction = this.connection;
        const tempRecord = Object.defineProperties(
            // $FlowFixMe
            new this.constructor({...this}, this[s.node]),
            {
                connection: {value: transaction, configurable: true}
            });
        Object.assign(tempRecord, this);

        Reflect.setPrototypeOf(tempRecord, this);

        await tempRecord.beforeDestroy();

        // $FlowFixMe
        await transaction.query(C.tag`
                MATCH ${tempRecord[s.selfQuery]('entry')}
                DETACH DELETE entry`);
        await tempRecord.afterDestroy();

        // $FlowFixMe
        this[s.node] = undefined;
        return this;
    }
}
