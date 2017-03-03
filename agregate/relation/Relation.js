// @flow

import {Cypher as C} from '../cypher';
import {BaseRelation} from './BaseRelation';

import * as queryBuilder from '../util/queryBuilder';
import acceptsTransaction from '../util/acceptsTransaction';
import {Record} from '../record/Record';
import * as R from 'ramda';

export class Relation extends BaseRelation {
    @acceptsTransaction
    async only(record: Record) {
        if (arguments.length === 0)            {return (await this.entries())[0]}        else if (record === null)            {return await this.clear()}        else if (!(record instanceof Record))            {throw new TypeError}        else {
            await this.clear()
            await this.add([ record ])
        }
    }

    get boundOnly(): Function { return this.only.bind(this); }

    @acceptsTransaction
    @acceptsRecords
    async has(records: Record[]) {
        return (await this.connection.query(C.tag`
            ${this.__namedSelfQuery('','relation','target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN count(relation) = ${records.length} as exists`))[0][0]
    }

    @acceptsTransaction
    @acceptsRecords
    async intersect(records: Record[]) {
        return R.transpose(await this.connection.query(C.tag`
            ${this.__namedSelfQuery('','','target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN target`))[0]
    }

    @acceptsTransaction
    @acceptsRecords
    async add(records: Record[]) {
        if (this.source instanceof Relation)            {throw new TypeError('cannot add entries to meta-relation due to uncertainty')}

        await this.connection.query(C.tag`
            MATCH ${this.__source('source')}
            MATCH ${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            MERGE (source)${this.__rel('relation')}(target)`)
    }

    // noinspection ReservedWordAsName - relation is trying to re-use Set API

    @acceptsTransaction
    @acceptsRecords
    async delete(records: Record[]) {
        await this.connection.query(C.tag`
            ${this.__namedSelfQuery('','relation','target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            DELETE relation`)
    }

    @acceptsTransaction
    async clear() {
        await this.connection.query(C.tag`
            ${this.__namedSelfQuery('','relation','')}

            DELETE relation`)
    }

    @acceptsTransaction
    async size(): Promise<number> {
        const [ [ relationCount ] ] = await this.connection.query(C.tag`
            ${this.__namedSelfQuery('','relation','')}

            RETURN count(relation) as relationCount`)
        return relationCount;
    }

    @acceptsTransaction
    entries() { return this.where(undefined,undefined) }

    @acceptsTransaction
    async where(params: ?Object,opts: ?Object) {
        const result = await this.connection.query(C.tag`
            ${this.__namedSelfQuery('','','target')}
            ${queryBuilder.whereQuery('target',params)}
            RETURN target
            ${queryBuilder.whereOpts('target',opts)}`);

        return R.transpose(result)[0] || [];
    }
}

function acceptsRecords(target,name,desc) {
    const {value} = desc

    desc.value = function (records,...rest) {
        if (!Array.isArray(records))            {records = [ records ]}

        this.__targetCheck(records)

        return value.apply(this,[records,...rest])
    }
}
