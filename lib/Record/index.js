import uuid from 'uuid'
import {MetaClass} from '../util/MetaClass'
import {
    checkRecordExistence,
    getRecordLabelMap,
    createParamsString,
    createNodeQuery
} from '../util/index'
import Converter from '../Converter'
import {Cypher} from 'cypher-talker'



export class Relation extends MetaClass {
    constructor(source, label, {targetLabel, direction = 1} = {}) {
        super()
        this.metadata = {source, label, direction, targetLabel}
    }

    __self(key = '', hopCount) {
        const {direction, label} = this.metadata
        const body = `${key}:${label}` + (hopCount
                ? `*..${hopCount === Infinity ? '' : hopCount}`
                : ``)
        return Cypher.raw(`${direction === -1 ? '<-' : '-'}[${body}]${direction === 1 ? '->' : '-'}`)
    }

    __source(key = '') {
        const {source} = this.metadata
        return Cypher.tag`(${Cypher.raw(key)}:${source.__createSelfQuery()})`
    }

    __target(key = '', props) {
        const {targetLabel} = this.metadata
        return Cypher.tag`(${Cypher.raw(targetLabel ? `${key}:${targetLabel}` : key)}${props ? Cypher.literal(props) : Cypher.raw('')})`
    }

    __targetCheck(record) {
        const {targetLabel} = this.metadata
        if (!targetLabel)
            return
        if (record.label !== targetLabel)
            throw new TypeError('trying to include non-compatible record into relation')
    }

    get connection() { return this.metadata.source.connection }

    async hasDeep(...records) {
        if (arguments.length === 0) {
            console.error('trying to compare against empty subset', this)
            return true
        }

        for (let record of records) {
            checkRecordExistence(record)
            this.__targetCheck(record)
        }

        const result = await this.connection.query(Cypher.tag`
            MATCH ${this.__source()}${this.__self('relation', Infinity)}${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}
            RETURN count(relation) = ${records.length} as exists`)
        return result[0].exists
    }

    async has(...records) {
        if (arguments.length === 0) {
            console.error('trying to compare against empty subset', this)
            return true
        }

        for (let record of records) {
            checkRecordExistence(record)
            this.__targetCheck(record)
        }

        const result = await this.connection.query(Cypher.tag`
            MATCH ${this.__source()}${this.__self('relation')}${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}
            RETURN count(relation) = ${records.length} as exists`)
        return result[0].exists
    }

    async size() {
        const response = await this.connection.query(Cypher.tag`
        MATCH ${this.__source('')}${this.__self('relation')}${this.__target('')}
        RETURN count(relation) as relationCount`)
        return response[0].relationCount
    }

    async add(...records) {
        for (let record of records)
            checkRecordExistence(record, `${this.label}#add`)

        this.__targetCheck(records)

        return this.connection.query(Cypher.tag`
                MATCH ${this.__source('source')}
                MATCH ${this.__target('target')}
                    WHERE target.uuid IN ${records.map(record => record.uuid)}
                MERGE (source)${this.__self()}(target)`)
    }

    async clear(props) {
        await this.connection.query(Cypher.tag`
            MATCH ${this.__source('')}${this.__self('relation')}${this.__target('', props)}
            DELETE relation`)
    }

    //noinspection ReservedWordAsName - relation is trying to re-use Set API

    async delete(...records) {
        for (let record of records)
            checkRecordExistence(record)

        this.__targetCheck(records)

        await this.connection.query(Cypher.tag`
            MATCH ${this.__source('')}${this.__self('relation')}${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}
            DELETE relation`)
    }

    async entries(props) {
        const response = await this.connection.query(Cypher.tag`
            MATCH ${this.__source('')}${this.__self('')}${this.__target('target', props)}
            RETURN target`)
        return response.map(({target}) => Converter.nodeToRecord(target))
    }
}

export class Record extends MetaClass {
    static register = Converter.registerRecordClass

    static Relation = Relation

    /** @private */
    static __createQuery(params) { return createNodeQuery(this.label, params)}

    static async byUuid(uuid) {
        if (uuid === undefined)
            throw new Error('trying to query by undefined uuid')

        return (await this.where({uuid}))[0]
    }

    static async where(params, {offset, limit, order} = {}) {
        if (order && !Array.isArray(order)) order = [order]

        return (await this.connection.query(Cypher.tag`
        MATCH (entry:${this.__createQuery(params)})
        RETURN entry
        ${Cypher.raw(order ?
            `ORDER BY ${order.map(orderEntity => `entry.${orderEntity}`).join(',')}`
            : ``)}
        ${Cypher.raw(offset ? `SKIP ${offset}` : ``)}
        ${Cypher.raw(limit ? `LIMIT ${limit}` : ``)}
        `))
            .map(result => result.entry)
            .map(Converter.nodeToRecord)
    }

    static get label() {return this.name}

    __createSelfQuery() {
        checkRecordExistence(this, `${this.label}#__createSelfQuery`)
        return this.__createQuery({uuid: this.uuid})
    }

    /** @private */
    __createQuery(params) { return createNodeQuery(this.label, params) }

    getRelation(relationName, props) {
        checkRecordExistence(this, `${this.label}#getRelation`)
        return new this.constructor.Relation(this, relationName, props)
    }

    get connection() { return this.constructor.connection }

    get uuid() { return this.metadata.node.properties.uuid }

    get label() {return this.constructor.label}

    constructor(opts = {}, metadata = {}) {
        super()
        Object.assign(this, opts)
        Object.assign(this.metadata, metadata)
    }

    async __create() {
        const [{entry}] = await this.connection.query(Cypher.tag`
        CREATE (entry:${Cypher.raw(this.label)})
        SET entry += ${{...this}},
            entry.created_at = timestamp(),
            entry.updated_at = timestamp(),
            entry.uuid = ${uuid.v4()}
        RETURN entry`)
        this.metadata.node = entry
        Object.assign(this, entry.properties)
    }

    async __update() {
        const [{entry}] = await this.connection.query(Cypher.tag`
        MATCH (entry:${this.__createSelfQuery()})
        SET entry += ${{...this}},
            entry.updated_at = timestamp()
        RETURN entry`)
        this.metadata.node = entry
        Object.assign(this, entry.properties)
    }

    async save(opts = {}) {
        Object.assign(this, opts)
        await (this.metadata.node ? this.__update() : this.__create())
        return this
    }

    async destroy() {
        checkRecordExistence(this, `${this.label}#destroy`)
        await this.connection.query(Cypher.tag`
        MATCH (entry:${this.__createSelfQuery()})
        DELETE entry`)
        this.metadata.destroyed = true
        return this
    }
}
