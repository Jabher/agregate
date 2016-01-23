import 'babel-polyfill'
import {GraphEntity} from './GraphEntity'
import {checkRecordExistence, Converter} from './util'
import {Cypher} from 'cypher-talker'
import * as builder from './queryBuilder'

export class Relation extends GraphEntity {
    constructor(source, label, {target, direction = 1} = {}) {
        if (Array.isArray(source))
            source = new Relation(...source)

        super({source, label, direction, target, targetLabel: target ? target.label : null})
    }

    __rel(varName = '') {
        const {direction, label} = this.metadata
        return Cypher.raw(`${direction < 0 ? '<' : ''}-[${varName}:${label}]-${direction > 0 ? '>' : ''}`)
    }

    __selfQuery(varName = '') {
        return Cypher.tag`${this.__source(varName)}${this.__rel()}${this.__target()}`
    }

    __namedSelfQuery(sourceName = '', varName = '', targetName = '') {
        return Cypher.tag`MATCH ${this.__source('source')}${this.__rel('relation')}${this.__target('target')}`
    }

    __source(varName = '') {
        return this.metadata.source.__selfQuery(varName)
    }

    __target(varName = '', params) {
        return Cypher.tag`(${
            Cypher.raw(this.metadata.targetLabel ? `${varName}:${this.metadata.targetLabel}` : varName)
            } {${Cypher.literal(params || {})}})`
    }

    __targetCheck(records) {
        const {targetLabel} = this.metadata
        if (records.length === 0) {
            console.warn(`trying to compare against empty subset`)
        }

        for (let record of records) {
            checkRecordExistence(record)
            if (targetLabel && record.label !== targetLabel)
                throw new TypeError('trying to include non-compatible record into relation')
        }
    }

    get connection() {
        return this.metadata.source.connection
    }

    async only() {
        switch (true) {
            case (arguments.length === 0):
                return (await this.entries())[0]
            case (arguments[0] === null):
                return await this.clear()
            default:
                return await this.__setAsOnly(...arguments)
        }
    }

    @acceptsRecords
    async __setAsOnly(record) {
        if (arguments.length > 1)
            throw new TypeError('cannot set multiple records as only record')

        const transaction = this.connection.transaction()
        await transaction.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', '')}

            DELETE relation`)

        if (record !== null)
            await transaction.query(Cypher.tag`
                MATCH ${this.__source('source')}
                MATCH ${this.__target('target')}
                    WHERE target.uuid = ${record.uuid}

                MERGE (source)${this.__rel('relation')}(target)`)

        await transaction.commit()
    }


    @acceptsRecords
    async has(...records) {
        return (await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN count(relation) = ${records.length} as exists`))[0].exists
    }

    /**
     * @param {Array<Promise<Relation|Array<Relation>>> | Array<Relation> } records
     * */
    @acceptsRecords
    async intersect(...records) {
        return (await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', '', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN target`)).map(({target}) => target)
    }

    @acceptsRecords
    async add(...records) {
        if (this.metadata.source instanceof Relation)
            throw new TypeError('cannot add entries to meta-relation due to uncertainty')

        await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}
            MATCH ${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            MERGE (source)${this.__rel('relation')}(target)`)
    }

    //noinspection ReservedWordAsName - relation is trying to re-use Set API

    @acceptsRecords
    async delete(...records) {
        await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            DELETE relation`)
    }

    async clear() {
        await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', '')}

            DELETE relation`)
    }

    async size() {
        return (await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', '')}

            RETURN count(relation) as relationCount`))
            [0].relationCount
    }

    async entries() {
        return await this.where()
    }

    async where(params, opts) {
        return (await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', '', 'target')}
            ${builder.whereQuery('target', params)}
            RETURN target
            ${builder.whereOpts(opts)}`))
            .map(({target}) => Converter.nodeToRecord(target))
    }
}


function acceptsRecords(target, name, desc) {
    const fn = desc.value
    desc.value = async function (...records) {
        if (records.length === 1 && Array.isArray(records[0]))
            return this[name](...records[0])
        if (records.some(record => record instanceof Promise))
            return this[name](...await Promise.all(records))

        this.__targetCheck(records)

        return await fn.apply(this, records)
    }
}