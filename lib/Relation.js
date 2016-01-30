import 'babel-polyfill'
import {GraphEntity} from './GraphEntity'
import {checkRecordExistence, Converter} from './util'
import {Cypher} from 'cypher-talker'
import * as builder from './queryBuilder'
import {AbstractQueryable} from './GraphConnection'

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

    __selfQuery(varName = '') { return Cypher.tag`${this.__source(varName)}${this.__rel()}${this.__target()}` }

    __namedSelfQuery(sourceName = '', varName = '', targetName = '') {
        return Cypher.tag`MATCH ${this.__source(sourceName)}${this.__rel(varName)}${this.__target(targetName)}`
    }

    __source(varName = '') { return this.metadata.source.__selfQuery(varName) }

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

    get connection() { return this.metadata.source.connection }

    async only(...args) {
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
    async __setAsOnly(record, transaction = this.connection.transaction()) {
        if (!(transaction instanceof AbstractQueryable)) {
            throw new TypeError('cannot use passed argument as queryable')
        }

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

    @acceptsTransaction
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
    @acceptsTransaction
    @acceptsRecords
    async intersect(...records) {
        return (await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', '', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN target`)).map(({target}) => target)
    }

    @acceptsTransaction
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

    @acceptsTransaction
    @acceptsRecords
    async delete(...records) {
        await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', 'target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            DELETE relation`)
    }

    @acceptsTransaction
    async clear() {
        await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', '')}

            DELETE relation`)
    }

    @acceptsTransaction
    async size() {
        return (await this.connection.query(Cypher.tag`
            ${this.__namedSelfQuery('', 'relation', '')}

            RETURN count(relation) as relationCount`))
            [0].relationCount
    }

    async entries(...args) { return await this.where(undefined, undefined, ...args) }

    @acceptsTransaction({place: 2})
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
    desc.value = async function(...records) {
        if (records.some(record => record instanceof Promise))
            records = await Promise.all(records)

        if (records.length === 1 && Array.isArray(records[0]))
            records = records[0]

        this.__targetCheck(records)

        return await fn.apply(this, records)
    }
}

function acceptsTransaction(opts) {
    const config = {
        place: 0,
        ...opts
    }
    return arguments.length !== 1
        ? acceptsTransactionDecorator.apply(this, arguments)
        : acceptsTransactionDecorator

    function acceptsTransactionDecorator(target, name, desc) {
        const fn = desc.value
        desc.value = async function(...args) {
            const lastArg = args[args.length - 1]
            const connection = lastArg instanceof AbstractQueryable
                ? args.pop()
                : this.connection

            if (!this.__connectionQueue)
                this.__connectionQueue = []
            else
                await Promise.all(this.__connectionQueue)

            Object.defineProperty(this, 'connection', {
                configurable: true,
                value: connection
            })
            while (args.length < config.place)
                args.push(undefined)

            const exec = fn.apply(this, args)
            this.__connectionQueue.push(exec.then(() => { delete this.connection }))
            return exec
        }
    }
}
