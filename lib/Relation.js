import {MetaClass, GraphEntity} from './MetaClass'
import {checkRecordExistence} from './util'
import {Cypher} from 'cypher-talker'
import Converter from './Converter'

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

    __source(varName = '') { return this.metadata.source.__selfQuery(varName) }

    __target(varName = '') {
        return Cypher.tag`(${Cypher.raw(this.metadata.targetLabel ? `${varName}:${this.metadata.targetLabel}` : varName)})`
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

    async has(...records) {
        this.__targetCheck(records)

        return (await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}${this.__rel('relation')}${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            RETURN count(relation) = ${records.length} as exists`))[0].exists
    }

    async add(...records) {
        if (this.metadata.source instanceof Relation)
            throw new TypeError('cannot add entries to meta-relation')

        this.__targetCheck(records)

        await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}
            MATCH ${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            MERGE (source)${this.__rel('relation')}(target)`)
    }

    //noinspection ReservedWordAsName - relation is trying to re-use Set API

    async delete(...records) {
        this.__targetCheck(records)

        await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}${this.__rel('relation')}${this.__target('target')}
                WHERE target.uuid IN ${records.map(record => record.uuid)}

            DELETE relation`)
    }

    async clear() {
        await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}${this.__rel('relation')}${this.__target('target')}

            DELETE relation`)
    }

    async size() {
        return (await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}${this.__rel('relation')}${this.__target('target')}

            RETURN count(relation) as relationCount`))
            [0].relationCount
    }

    async entries() {
        return (await this.connection.query(Cypher.tag`
            MATCH ${this.__source('source')}${this.__rel('relation')}${this.__target('target')}
            RETURN target`))
            .map(({target}) => Converter.nodeToRecord(target))
    }
}
