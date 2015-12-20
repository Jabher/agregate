import {MetaClass} from './MetaClass'
import {checkRecordExistence} from './util'
import {Cypher} from 'cypher-talker'
import Converter from './Converter'

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
