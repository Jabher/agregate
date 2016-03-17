import {Cypher as C} from 'cypher-talker'
import acceptsTransaction from '../util/acceptsTransaction'
import BaseRecord from './BaseRecord'
import * as queryBuilder from '../util/queryBuilder'

export default class Record extends BaseRecord {
    static indexes = new Set();

    static resolve(node) { return new (this.connection.classMap.get(node.labels[0]))(node.properties, {node}) }

    resolve(node) { return this.constructor.resolve(node) }

    @acceptsTransaction
    static async register() {
        this.connection.classMap.set(this.label, this)
        await this.connection.query(
            ...[...this.indexes].map(index => C.tag`CREATE INDEX ON :Person(${C.raw(index)})`),
            C.tag`CREATE INDEX ON :${C.raw(this.label)}(uuid)`,
            C.tag`CREATE CONSTRAINT ON (entity:${C.raw(this.label)}) ASSERT entity.uuid IS UNIQUE`)
    }

    @acceptsTransaction
    static async where(params, opts) {
        const results = await this.connection.query(C.tag`
        MATCH ${this.selfQuery('entry')}
        ${queryBuilder.whereQuery('entry', params)}
        RETURN entry
        ${queryBuilder.whereOpts(opts)}`)
        return results
            .map(result => result.entry)
            .map(node => this.resolve(node))
    }

    @acceptsTransaction
    static async byUuid(uuid) {
        if (uuid === undefined)
            throw new Error('trying to query by undefined uuid')

        return (await this.where({uuid}))[0]
    }

    @acceptsTransaction
    static async firstOrInitialize(params) {
        if (params.uuid)
            throw new Error('cannot explicitly create entry from uuid')
        const tx = this.connection.transaction()
        let [result] = await this.where(params, {limit: 1}, tx.transaction())
        if (!result)
            result = await new this().save(params, tx.transaction())
        await tx.commit()
        return result
    }
}
