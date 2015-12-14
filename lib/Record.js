import uuid from 'uuid'
import {MetaClass} from './MetaClass'
import {query} from './Connection'
import {checkRecordExistence, getRecordLabelMap, createParamsString, createNodeQuery} from './util'
import Converter from './Converter'

export class Record extends MetaClass {
    static register = Converter.registerRecordClass

    /** @private */
    static __createQuery(params) { return createNodeQuery(this.label, params)}

    static async byUuid(uuid) {
        if (uuid === undefined)
            throw new Error('trying to query by undefined uuid')

        return (await this.where({uuid}))[0]
    }

    static async where(params) {
        const req = `MATCH (entry:${this.__createQuery(params)}) RETURN entry`
        return (await query(req, params))
            .map(result => result.entry)
            .map(Converter.nodeToRecord)
    }

    static get label() {return this.name}

    __createSelfQuery(key = 'uuid') {
        checkRecordExistence(this, `${this.label}#__createSelfQuery`)
        return this.__createQuery({[key]: this.uuid})
    }

    /** @private */
    __createQuery(params) { return createNodeQuery(this.label, params) }

    getRelation(relationName) {
        checkRecordExistence(this, `${this.label}#getRelation`)
        return new Relation(this, relationName)
    }

    get uuid() { return this.metadata.node.properties.uuid }


    get label() {return this.constructor.label}

    constructor(opts = {}, metadata = {}) {
        super()
        Object.assign(this, {...opts, metadata})
    }

    async save(opts = {}) {
        Object.assign(this, opts)
        const params = {...this}
        const q = `MERGE (entry:${this.__createQuery()} {${[...createParamsString(params), `updated_at: timestamp()`]}})
        ON CREATE SET entry.created_at = timestamp(), entry.uuid = {uuid}
        RETURN entry`
        const [{entry}] = await query(q, {...params, uuid: uuid()})
        Object.assign(this, entry.properties)
        this.metadata.node = entry
    }

    async destroy() {
        checkRecordExistence(this, `${this.label}#destroy`)
        await query(`MATCH (entry:${this.__createSelfQuery()}) DELETE entry`, {uuid: this.uuid})
        this.metadata.destroyed = true
    }
}

class Relation extends MetaClass {
    constructor(source, label) {
        super()
        this.metadata = {source, label}
    }

    async size() {
        const {source, label} = this.metadata
        const response = await query(`MATCH (source:${source.__createSelfQuery()})-[relation:${label}]-()
RETURN count(relation)`, {uuid: source.uuid})
        return response[0]['count(relation)']
    }

    async add(...records) {
        const {source, label} = this.metadata
        for (let record of records)
            checkRecordExistence(record, `${this.label}#add`)
        return Promise.all(getRecordLabelMap(records)
            .map(([recordLabel, records]) =>
                query(`
MATCH (source:${source.__createSelfQuery()})
MATCH (target:${recordLabel})
    WHERE target.uuid IN {targetUuids}
MERGE (source)-[:${label}]-(target)`,
                    {uuid: source.uuid, targetUuids: records.map(record => record.uuid)})))
    }

    async clear() {
        const {source, label} = this.metadata
        await query([
            `MATCH (:${source.__createSelfQuery()})-[relation:${label}]-()`,
            `DELETE relation`
        ], {uuid: source.uuid})
    }

    //noinspection ReservedWordAsName - relation is trying to re-use Set API
    async delete(...records) {
        const {source, label} = this.metadata
        for (let record of records)
            checkRecordExistence(record)
        await Promise.all(getRecordLabelMap(records).map(([recordLabel, records]) =>
            query(`
MATCH (:${source.__createSelfQuery()})-[relation:${label}]-(target:${recordLabel})
    WHERE target.uuid IN {targetUuids}
DELETE relation`,
                {uuid: source.uuid, targetUuids: records.map(record => record.uuid)})))
    }

    async entries(props = {}, type = null) {
        const {source, label} = this.metadata
        const response = await query([
            `MATCH (entry:${source.__createSelfQuery()})-[:${label}]-(target${type ? `:${type}` : ''} ${createParamsString(props)})`,
            `RETURN target`], {uuid: source.uuid})
        return response.map(({target}) => Converter.nodeToRecord(target))
    }
}