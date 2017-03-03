// @flow
import {Cypher as C} from '../cypher';
import checkRecordExistence from '../util/checkRecordExistence';
import {Record} from '../record';
import {Connection} from '../connection';
import * as s from '../symbols';

type Init = {
    direction: number,
    target: Record
};

export class BaseRelation {
    direction: number;
    targetLabel: ?string;
    label: string;
    source: Record | BaseRelation;

    get toRel(): string {return this.direction > 0 ? '->' : '-'}

    get fromRel(): string { return this.direction < 0 ? '<-' : '-'}

    constructor(source: Record | BaseRelation,label: string,{target,direction = 1}: Init = {}) {
        Object.defineProperties(this,{
            source: {value: source},
            label: {value: label},
            direction: {value: direction},
            targetLabel: {value: target ? target[s.label] : null}
        })
    }

    __rel(varName: string = '') {
        return C.raw(`${this.fromRel}[${varName}:${this.label}]${this.toRel}`)
    }

    // $FlowFixMe
    [s.selfQuery](sourceName: string = '') {
        return C.tag`${this.__source(sourceName)}${this.__rel('')}${this.__target('')}`
    }

    __namedSelfQuery(sourceName: string = '',varName: string = '',targetName: string = '') {
        return C.tag`MATCH ${this.__source(sourceName)}${this.__rel(varName)}${this.__target(targetName)}`
    }

    // $FlowFixMe
    __source(varName: string = '') { return this.source[s.selfQuery](varName) }

    __target(varName: string = '',params: Object = {}) {
        const key = C.raw(this.targetLabel ? `${varName}:${this.targetLabel}` : varName)
        if (Object.keys(params).length === 0)            {return C.tag`(${key})`}        else            {return C.tag`(${key} {${C.literal(params)}})`}
    }

    __targetCheck(records: Record[]): void {
        if (records.length === 0)            {console.warn('trying to compare against empty subset')}

        for (let record of records)            {checkRecordExistence(record)}

        for (let record of records) {
            if (this.targetLabel && record[s.label] !== this.targetLabel)            {throw new TypeError('trying to include non-compatible record into relation')}
        }
    }

    get connection(): Connection { return this.source.connection }
}
