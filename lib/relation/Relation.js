import {Cypher as C} from 'cypher-talker'
import BaseRelation from './BaseRelation'

import * as queryBuilder from '../util/queryBuilder'
import acceptsTransaction from '../util/acceptsTransaction'
import Record from '../record/Record'

export default class Relation extends BaseRelation {
    resolve(node) { return this.metadata.source.resolve(node) }

    @acceptsTransaction({force: true})
    async only(record) {
        switch (record) {
            case undefined:
                return (await this.entries())[0]
            case null:
                return await this.clear()
            default:
                if (!(record instanceof Record))
                    throw new TypeError

                await this.clear()
                await this.add(record)
        }
    }

    @acceptsTransaction
    @acceptsRecords
    async has(records) {
        return (await this.connection.query(C.tag`
            ${this.namedSelfQuery('', 'relation', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN count(relation) = ${records.length} as exists`))[0].exists
    }

    @acceptsTransaction
    @acceptsRecords
    async intersect(records) {
        return (await this.connection.query(C.tag`
            ${this.namedSelfQuery('', '', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN target`)).map(({target}) => target)
    }

    @acceptsTransaction
    @acceptsRecords
    async add(records) {
        if (this.metadata.source instanceof Relation)
            throw new TypeError('cannot add entries to meta-relation due to uncertainty')

        await this.connection.query(C.tag`
            MATCH ${this.__source('source')}
            MATCH ${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            MERGE (source)${this.__rel('relation')}(target)`)
    }

    //noinspection ReservedWordAsName - relation is trying to re-use Set API

    @acceptsTransaction
    @acceptsRecords
    async delete(records) {
        await this.connection.query(C.tag`
            ${this.namedSelfQuery('', 'relation', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            DELETE relation`)
    }

    @acceptsTransaction
    async clear() {
        await this.connection.query(C.tag`
            ${this.namedSelfQuery('', 'relation', '')}

            DELETE relation`)
    }

    @acceptsTransaction
    async size() {
        return (await this.connection.query(C.tag`
            ${this.namedSelfQuery('', 'relation', '')}

            RETURN count(relation) as relationCount`))
            [0].relationCount
    }

    @acceptsTransaction
    entries() { return this.where(undefined, undefined) }

    @acceptsTransaction
    async where(params, opts) {
        return (await this.connection.query(C.tag`
            ${this.namedSelfQuery('', '', 'target')}
            ${queryBuilder.whereQuery('target', params)}
            RETURN target
            ${queryBuilder.whereOpts(opts)}`))
            .map(({target}) => this.resolve(target))
    }
}

function acceptsRecords(target, name, desc) {
    const fnSymbol = Symbol(`unwrapped ${name}`)
    target[fnSymbol] = desc.value

    desc.value = async function(records) {
        if (records.then instanceof Function)
            records = await records
        if (!Array.isArray(records))
            records = [records]
        if (records.some(record => record instanceof Promise))
            records = await Promise.all(records)

        this.__targetCheck(records)

        return await this[fnSymbol](records)
    }
}
