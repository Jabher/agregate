import 'babel-polyfill'
import uuid from 'uuid'
import {Cypher as C} from 'cypher-talker'
import {GraphEntity} from './GraphEntity'
import {checkRecordExistence, createNodeQuery} from './util'
import Converter from './Converter'
import {Relation} from './Relation'

export class Record extends GraphEntity {
    static indexes = new Set()

    static async register() {
        Converter.registerRecordClass(this)
        await this.connection.query(
            ...[...this.indexes].map(index => C.tag`CREATE INDEX ON :Person(${C.raw(index)})`),
            C.tag`CREATE INDEX ON :${C.raw(this.label)}(uuid)`,
            C.tag`CREATE CONSTRAINT ON (entity:${C.raw(this.label)}) ASSERT entity.uuid IS UNIQUE`)
    }

    static async byUuid(uuid) {
        if (uuid === undefined)
            throw new Error('trying to query by undefined uuid')

        return (await this.where({uuid}))[0]
    }

    static async where(params, {offset, limit, order} = {}) {
        if (order && !Array.isArray(order)) order = [order]

        return (await this.connection.query(C.tag`
        MATCH ${this.__selfQuery('entry', params)}
        
        RETURN entry
        ${C.raw(order ? `ORDER BY ${order.map(orderEntity => `entry.${orderEntity}`).join(',')}` : ``)}
        ${C.raw(offset ? `SKIP ${offset}` : ``)}
        ${C.raw(limit ? `LIMIT ${limit}` : ``)}
        `))
            .map(result => result.entry)
            .map(Converter.nodeToRecord)
    }

    static async firstOrInitialize(params) {
        if (params.uuid)
            throw new Error('cannot explicitly create entry from uuid')

        return Converter.nodeToRecord(
            (await this.connection.query(C.tag`
        MERGE ${this.__selfQuery('entry', params)}
            ON CREATE SET entry.uuid = ${uuid.v4()}
        RETURN entry
        LIMIT 1
        `))[0].entry)
    }

    static get label() { return this.name }

    static __selfQuery(key, query) { return C.tag`(${C.raw(key)}:${C.raw(this.label)} {${C.literal(query)}})` }

    __selfQuery(key, query = {uuid: this.uuid}) {
        checkRecordExistence(this)
        return this.constructor.__selfQuery(key, query)
    }

    get connection() { return this.constructor.connection }

    get uuid() { return this.metadata.node ? this.metadata.node.properties.uuid : undefined }

    get label() { return this.constructor.label }

    constructor(opts = {}, metadata = {}) {
        super(metadata)
        Object.assign(this, opts)
    }

    toJSON() {
        const returnValue = {...this}
        for (let key of Object.keys(returnValue))
            if (returnValue[key] instanceof Relation || returnValue[key] instanceof Function)
                delete returnValue[key]

        return returnValue
    }

    async save(opts = {}) {
        const state = {...this}
        const metadata = Object.create(this.metadata)
        const transaction = this.connection.transaction()
        const query = transaction.query.bind(transaction)
        try {
            const isUpdating = !!this.metadata.node
            Object.assign(this, opts)
            await (isUpdating ? this.beforeUpdate(query) : this.beforeCreate(query))
            const requestContent = this.metadata.node
                ? C.tag`MATCH ${this.__selfQuery('entry')}
                        SET entry += ${this.toJSON()}, entry.updated_at = timestamp()`
                : C.tag`CREATE (entry:${C.raw(this.label)})
                        SET entry += ${this.toJSON()},
                            entry.created_at = timestamp(),
                            entry.updated_at = timestamp(),
                            entry.uuid = ${uuid.v4()}`
            const [{entry}] = await transaction.query(C.tag`${requestContent} RETURN entry`)
            this.metadata.node = entry
            Object.assign(this, entry.properties)
            await (isUpdating ? this.afterUpdate(query) : this.afterCreate(query))
            await transaction.commit()
        } catch (e) {
            await transaction.rollback()
            this.metadata = metadata
            Object.assign(this, state)
            throw e
        }
        return this
    }

    async destroy() {
        checkRecordExistence(this, `${this.label}#destroy`)

        const state = {...this}
        const metadata = Object.create(this.metadata)
        const transaction = this.connection.transaction()
        const query = transaction.query.bind(transaction)
        try {
            await this.beforeDestroy(query)
            await transaction.query(C.tag`
        MATCH ${this.__selfQuery('entry')}
        DELETE entry`)
            await this.afterDestroy(query)
            this.metadata.node = null
            await transaction.commit()
            return this
        } catch (e) {
            await transaction.rollback()
            this.metadata = metadata
            Object.assign(this, state)
            throw e
        }
    }
}

Object.assign(Record.prototype, {
    beforeCreate() {},
    afterCreate() {},
    beforeUpdate() {},
    afterUpdate() {},
    beforeDestroy() {},
    afterDestroy() {}
})