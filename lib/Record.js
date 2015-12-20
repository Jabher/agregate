import uuid from 'uuid'
import {Cypher} from 'cypher-talker'
import {MetaClass} from './MetaClass'
import {checkRecordExistence, createNodeQuery} from './util'
import Converter from './Converter'
import {Relation} from './Relation'

export class Record extends MetaClass {
    static register = Converter.registerRecordClass

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

    defineRelations(relations) {
        for (let key of Object.keys(relations)) {
            if (Array.isArray(relations[key])) {
                Object.defineProperty(this, key, {value: new Relation(this, ...relations[key]), configurable: true})
            } else if (relations[key] instanceof Relation) {
                Object.defineProperty(this, key, {value: relations[key], configurable: true})
            } else {
                throw new TypeError('cannot define not-relation as relation')
            }
        }
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
