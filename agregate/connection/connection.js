// @flow
import "../polyfill";
import { Driver } from "./driver";
import { Record } from "../record";
import { Relation } from "../relation";
import { Cypher as C } from "../cypher";
// import debug from "debug";
import { v1 as neo4j } from "neo4j-driver";
import * as R from "ramda";

type ConnectionInit = {
  username: string;
  password: string;
}

// const log = debug('Agregate:Connection');


export class Connection extends Driver {
  relationClasses: { [key: string]: Class<Record> } = Object.create(null);
  recordClasses: { [key: string]: Class<Relation> } = Object.create(null);

  __resetResolver() {
    this.relationClasses = Object.create(null);
    this.recordClasses = Object.create(null);
  }

  __resolveInit: Function;
  __rejectInit: Function;
  __initQueries: Promise<any>[] = [];

  __Metadata: Class<Record>;

  constructor(host: string, init: ConnectionInit) {
    super(host, Driver.basic(init.username, init.password));

    this.__Metadata = class AgregateClassMetadata extends Record {
      static connection = this;
      static get __label(): string { return "Agregate__ClassMetadata" }

      nodeName: string;
      indices: string[] = [];
      uniquenessConstraints: string[] = [];
      _nodeKeyConstraints: string[] = [];
      existenceConstraints: string[] = [];

      get nodeKeyConstraints(): string[][] {
        return this._nodeKeyConstraints.map(val => val.split(',').sort())
      }

      set nodeKeyConstraints(val: string[][]): void {
        this._nodeKeyConstraints = val.map(strings => strings.sort().join(','))
      }
    };

    this.recordClasses[this.__Metadata.__label] = this.__Metadata;
  }

  resolveRelation(value: neo4j.types.Relation) {
    const { type, properties } = value;
    const relationClass = this.relationClasses[type];
    if (relationClass) {
      return new relationClass(properties, [type]);
    } else {
      return super.resolveRelation(value);
    }
  }

  resolveNode(value: neo4j.types.Node): Object {
    const { labels, properties } = value;
    const recordClasses = labels.map(label => this.recordClasses[label]).filter(klass => klass);
    if (recordClasses.length === 1) {
      const record = new recordClasses[0](properties, labels);
      record.__node = value;
      return record;
    } else if (recordClasses.length === 0) {
      return super.resolveNode(value);
    } else {
      console.warn('resolver is confused. Multiple classes do match single db node', value);
      throw new Error('resolver got confused');
    }
  }

  async registerRecordClass(klass: Class<Record>, {
    label,
    indices,
    uniquenessConstraints,
    nodeKeyConstraints,
    existenceConstraints
  }: {
    label: string,
    indices: string[],
    uniquenessConstraints: Array<string[] | string>,
    nodeKeyConstraints: string[][],
    existenceConstraints: string[]
  }): Promise<void> {
    if (this.recordClasses[label]) {throw new Error('duplicate label error: ' + label);}

    this.recordClasses[label] = klass;

    const tx = await this.transaction();

    const metadata = await this.__Metadata.firstOrInitialize({ nodeName: klass.__label }, tx);

    for (const key of R.difference(metadata.indices, indices)) {
      await tx.query(C.tag`DROP INDEX ON :${C.raw(label)}(${C.raw(key)})`);
    }
    for (const key of R.difference(indices, metadata.indices)) {
      await tx.query(C.tag`CREATE INDEX ON :${C.raw(label)}(${C.raw(key)})`);
    }
    for (const key of R.difference(metadata.uniquenessConstraints, uniquenessConstraints)) {
      await tx.query(C.tag`DROP CONSTRAINT ON (entity:${C.raw(label)}) ASSERT entity.${C.raw(key)} IS UNIQUE`);
    }
    for (const key of R.difference(uniquenessConstraints, metadata.uniquenessConstraints)) {
      await tx.query(C.tag`CREATE CONSTRAINT ON (entity:${C.raw(label)}) ASSERT entity.${C.raw(key)} IS UNIQUE`);
    }
    for (const key of R.difference(metadata.nodeKeyConstraints, nodeKeyConstraints)) {
      await tx.query(C.tag`DROP CONSTRAINT ON (entity:${C.raw(label)}) ASSERT (${C.raw(key.sort().map(i => `value.${i}`).join(','))}) IS NODE KEY`);
    }
    for (const key of R.difference(nodeKeyConstraints, metadata.nodeKeyConstraints)) {
      await tx.query(C.tag`CREATE CONSTRAINT ON (entity:${C.raw(label)}) ASSERT (${C.raw(key.sort().map(i => `value.${i}`).join(','))}) IS NODE KEY`);
    }
    for (const key of R.difference(metadata.existenceConstraints, existenceConstraints)) {
      await tx.query(C.tag`DROP CONSTRAINT ON (entity:${C.raw(label)}) ASSERT exists(value.${C.raw(key)})`);
    }
    for (const key of R.difference(existenceConstraints, metadata.existenceConstraints)) {
      await tx.query(C.tag`CREATE CONSTRAINT ON (entity:${C.raw(label)}) ASSERT exists(value.${C.raw(key)})`);
    }

    Object.assign(metadata, {
      indices,
      uniquenessConstraints,
      nodeKeyConstraints,
      existenceConstraints
    });

    await metadata.save(tx);

    await tx.commit();
  }

  registerRelationClass(klass: Class<Relation>) {
    if (this.relationClasses[klass.label]) {
      throw new Error('duplicate label error: ' + klass.label);
    }

    this.relationClasses[klass.label] = klass;
  }
}