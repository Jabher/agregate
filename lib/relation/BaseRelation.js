import MetadataClass from '../MetadataClass';
import {Cypher as C} from 'cypher-talker/build/Cypher/index'
import checkRecordExistence from '../util/checkRecordExistence'

export default class BaseRelation extends MetadataClass {
    constructor(source, label, {target, direction = 1} = {}) {
        const targetLabel = target ? target.label : null
        super({source, label, direction, target, targetLabel})
    }

    __rel(varName = '') {
        const {direction, label} = this.metadata
        return C.raw(`${direction < 0 ? '<' : ''}-[${varName}:${label}]-${direction > 0 ? '>' : ''}`)
    }

    selfQuery(sourceName = '') {
        return C.tag`${this.__source(sourceName)}${this.__rel('')}${this.__target('')}`
    }

    namedSelfQuery(sourceName = '', varName = '', targetName = '') {
        return C.tag`MATCH ${this.__source(sourceName)}${this.__rel(varName)}${this.__target(targetName)}`
    }

    __source(varName = '') { return this.metadata.source.selfQuery(varName) }

    __target(varName = '', params) {
        const key = C.raw(this.metadata.targetLabel ? `${varName}:${this.metadata.targetLabel}` : varName)
        return C.tag`(${key} {${C.literal(params || {})}})`
    }

    __targetCheck(records) {
        const {targetLabel} = this.metadata
        if (records.length === 0)
            console.warn(`trying to compare against empty subset`)

        for (let record of records)
            checkRecordExistence(record)

        for (let record of records) if (targetLabel && record.label !== targetLabel)
            throw new TypeError('trying to include non-compatible record into relation')
    }

    get connection() { return this.metadata.source.connection }
}
