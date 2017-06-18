// @flow
import { Cypher as C, Var } from "../cypher";
import checkRecordExistence from "../util/checkRecordExistence";
import { Record } from "../record";
import { Connection } from "../connection";

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

  constructor(source: Record | BaseRelation, label: string, { target, direction = 1 }: Init = {}) {
    Object.defineProperties(this, {
      source: { value: source },
      label: { value: label },
      direction: { value: direction },
      targetLabel: { value: target ? target.__label : null }
    })
  }

  __rel(varName: Var = new Var()) {
    return C.tag`${C.raw(this.fromRel)}[${varName}:${C.raw(this.label)}]${C.raw(this.toRel)}`;
  }

  __selfQuery(sourceName: Var) {
    const target = this.targetLabel ? C.tag`(:${C.raw(this.targetLabel)})` : C.tag`()`;
    return C.tag`${this.__source(sourceName)}${this.__rel()}${target}`;
  }

  __namedSelfQuery(source: Var, varName: Var = new Var(), targetName: Var = new Var()) {
    const target = this.targetLabel ? C.tag`(${targetName}:${C.raw(this.targetLabel)})` : C.tag`(${targetName})`;
    const intermediate = new Var();
    return C.tag`
    ${
      this.source instanceof BaseRelation
        ? this.source.__namedSelfQuery(source, new Var(), intermediate)
        : this.source.__namedSelfQuery(intermediate)
      }
    MATCH (${intermediate})${this.__rel(varName)}${target}`
  }

  __source(varName: Var) { return this.source.__selfQuery(varName) }

  __target(varName: Var, params: Object = {}) {
    const key = this.targetLabel ? C.tag`${varName}:${C.raw(this.targetLabel)}` : varName
    if (Object.keys(params).length === 0) {return C.tag`(${key})`} else {return C.tag`(${key} {${C.literal(params)}})`}
  }

  __targetCheck(records: Record[]): void {
    if (records.length === 0) {console.warn('trying to compare against empty subset')}

    for (let record of records) {checkRecordExistence(record)}

    for (let record of records) {
      if (this.targetLabel && record.__label !== this.targetLabel) {throw new TypeError('trying to include non-compatible record into relation')}
    }
  }

  get connection(): Connection { return this.source.connection }
}
