import uuid from 'uuid'
import {Cypher} from 'cypher-talker'
import {MetaClass, GraphEntity} from './MetaClass'
import {checkRecordExistence, createNodeQuery} from './util'
import Converter from './Converter'
import {Relation} from './Relation'

export class Record extends GraphEntity {
    static indexes = new Set()
    static async register() {
        Converter.registerRecordClass(this)
        await Promise.all([...this.indexes].map(index => this.connection.query(Cypher.tag`
            CREATE INDEX ON :Person(${Cypher.raw(index)})`)))
        await this.connection.query(Cypher.tag`
        CREATE INDEX ON :${Cypher.raw(this.label)}(uuid)
        CREATE CONSTRAINT ON (entity:${Cypher.raw(this.label)}) ASSERT entity.uuid IS UNIQUE`)
    }

    static async byUuid(uuid) {
        if (uuid === undefined)
            throw new Error('trying to query by undefined uuid')

        return (await this.where({uuid}))[0]
    }

    static async where(params, {offset, limit, order} = {}) {
        if (order && !Array.isArray(order)) order = [order]

        return (await this.connection.query(Cypher.tag`
        MATCH (entry:${createNodeQuery(this.label, params)})
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

    __selfQuery(key) {
        checkRecordExistence(this)
        return Cypher.tag`(${Cypher.raw(key)}:${Cypher.raw(this.label)} {${Cypher.literal({uuid: this.uuid})}})`
    }

    defineRelations(relations) {
        for (let key of Object.keys(relations)) {
            if (Array.isArray(relations[key]))
                Object.defineProperty(this, key, {value: new Relation(this, ...relations[key]), configurable: true})
            else if (relations[key] instanceof Relation)
                Object.defineProperty(this, key, {value: relations[key], configurable: true})
            else
                throw new TypeError('cannot define not-relation as relation')
        }
    }

    get connection() { return this.constructor.connection }

    get uuid() { return this.metadata.node ? this.metadata.node.properties.uuid : null }

    get label() {return this.constructor.label}

    constructor(opts = {}, metadata = {}) {
        super(metadata)
        Object.assign(this, opts)
    }

    async save(opts = {}) {
        Object.assign(this, opts)
        const requestContent = this.metadata.node
            ? Cypher.tag`MATCH ${this.__selfQuery('entry')}
                        SET entry += ${{...this}}, entry.updated_at = timestamp()`
            : Cypher.tag`CREATE (entry:${Cypher.raw(this.label)})
                        SET entry += ${{...this}},
                            entry.created_at = timestamp(),
                            entry.updated_at = timestamp(),
                            entry.uuid = ${uuid.v4()}`
        const [{entry}] = await this.connection.query(Cypher.tag`${requestContent} RETURN entry`)
        this.metadata.node = entry
        Object.assign(this, entry.properties)
        return this
    }

    async destroy() {
        checkRecordExistence(this, `${this.label}#destroy`)
        await this.connection.query(Cypher.tag`
        MATCH ${this.__selfQuery('entry')}
        DELETE entry`)
        this.metadata.node = null
        return this
    }
}
