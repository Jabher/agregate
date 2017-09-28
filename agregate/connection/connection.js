// @flow
import '../polyfill'
import { Driver } from './driver'
import { Record } from '../record'
import { Relation } from '../relation'
import { Cypher as C } from '../cypher'
// import debug from "debug";
import { v1 as neo4j } from 'neo4j-driver'
import * as R from 'ramda'

type ConnectionInit = {
  username: string,
  password: string
};

// const log = debug('Agregate:Connection');

export class Connection extends Driver {
  relationClasses: { // noinspection JSUnresolvedVariable
    [key: string]: Class<Record>
  } = Object.create(null);

  recordClasses: { // noinspection JSUnresolvedVariable
    [key: string]: Class<Relation>
  } = Object.create(null);
  // noinspection JSUnusedGlobalSymbols
  __resolveInit: Function;
  // noinspection JSUnusedGlobalSymbols
  __rejectInit: Function;
  // noinspection JSUnusedGlobalSymbols
  __initQueries: Promise<any>[] = [];
  // noinspection JSUnresolvedVariable
  __Metadata: Class<Record>;

  constructor(host: string, init: ConnectionInit) {
    super(host, Driver.basic(init.username, init.password))

    class ProxyRecord extends Record {
      static connection = this;
    }

    this.__Metadata = class AgregateClassMetadata extends ProxyRecord {
      // noinspection JSUnusedGlobalSymbols
      nodeName: string;
      indices: string[] = [];
      uniquenessConstraints: string[] = [];
      existenceConstraints: string[] = [];

      static get __label(): string {
        return 'Agregate__ClassMetadata'
      }

      // noinspection JSMismatchedCollectionQueryUpdate
      _nodeKeyConstraints: string[] = [];

      get nodeKeyConstraints(): string[][] {
        return this._nodeKeyConstraints.map(val => val.split(',').sort())
      }

      set nodeKeyConstraints(val: string[][]): void {
        this._nodeKeyConstraints = val.map(strings => strings.sort().join(','))
      }
    }
    // noinspection JSUnresolvedVariable
    this.recordClasses[this.__Metadata.__label] = this.__Metadata
  }

  // noinspection JSUnusedGlobalSymbols
  __resetResolver() {
    this.relationClasses = Object.create(null)
    this.recordClasses = Object.create(null)
  }

  // noinspection JSUnresolvedVariable, JSUnusedGlobalSymbols
  resolveRelation(value: neo4j.types.Relation) {
    const { type, properties } = value
    const RelationClass = this.relationClasses[type]
    if (RelationClass) {
      return new RelationClass(properties, [type])
    } else {
      // noinspection JSUnresolvedFunction
      return super.resolveRelation(value)
    }
  }

  // noinspection JSUnresolvedVariable, JSUnusedGlobalSymbols
  resolveNode(value: neo4j.types.Node): Object {
    const { labels, properties } = value
    const recordClasses = labels
      .map(label => this.recordClasses[label])
      .filter(klass => klass)
    if (recordClasses.length === 1) {
      const record = new recordClasses[0](properties, labels)
      record.__node = value
      return record
    } else if (recordClasses.length === 0) {
      // noinspection JSUnresolvedFunction
      return super.resolveNode(value)
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        'resolver is confused. Multiple classes do match single db node',
        value
      )
      throw new Error('resolver got confused')
    }
  }

  // noinspection JSUnresolvedVariable
  async registerRecordClass(klass: Class<Record>,
                            {
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
    if (this.recordClasses[label]) {
      throw new Error('duplicate label error: ' + label)
    }

    this.recordClasses[label] = klass

    // noinspection JSUnresolvedFunction, JSUnresolvedVariable
    const m = await this.__Metadata.firstOrInitialize(
      { nodeName: klass.__label }
    )

    for (const key of R.difference(m.indices, indices)) {
      await this.query(C.tag`DROP INDEX ON :${C.raw(label)}(${C.raw(key)})`).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }
    for (const key of R.difference(m.uniquenessConstraints, uniquenessConstraints)) {
      await this.query(
        C.tag`DROP CONSTRAINT ON (entity:${C.raw(label)}) ASSERT entity.${C.raw(
          key
        )} IS UNIQUE`
      ).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }
    for (const key of R.difference(m.nodeKeyConstraints, nodeKeyConstraints)) {
      await this.query(
        C.tag`DROP CONSTRAINT ON (entity:${C.raw(label)}) ASSERT (${C.raw(
          key.sort().map(i => `entity.${i}`).join(',')
        )}) IS NODE KEY`
      ).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }
    for (const key of R.difference(m.existenceConstraints, existenceConstraints)) {
      await this.query(
        C.tag`DROP CONSTRAINT ON (entity:${C.raw(
          label
        )}) ASSERT exists(entity.${C.raw(key)})`
      ).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }

    // ----

    for (const key of R.difference(indices, m.indices)) {
      await this.query(C.tag`CREATE INDEX ON :${C.raw(label)}(${C.raw(key)})`).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }

    for (const key of R.difference(uniquenessConstraints, m.uniquenessConstraints)) {
      await this.query(
        C.tag`CREATE CONSTRAINT ON (entity:${C.raw(
          label
        )}) ASSERT entity.${C.raw(key)} IS UNIQUE`
      ).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }
    for (const key of R.difference(nodeKeyConstraints, m.nodeKeyConstraints)) {
      await this.query(
        C.tag`CREATE CONSTRAINT ON (entity:${C.raw(label)}) ASSERT (${C.raw(
          key.sort().map(i => `entity.${i}`).join(',')
        )}) IS NODE KEY`
      ).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }
    for (const key of R.difference(existenceConstraints, m.existenceConstraints
    )) {
      await this.query(
        C.tag`CREATE CONSTRAINT ON (entity:${C.raw(
          label
        )}) ASSERT exists(entity.${C.raw(key)})`
      ).catch(e => // eslint-disable-next-line no-console
        console.warn(e.message))
    }

    Object.assign(m, {
      indices,
      uniquenessConstraints,
      nodeKeyConstraints,
      existenceConstraints
    })

    await m.save()
  }

  // noinspection JSUnresolvedVariable, JSUnusedGlobalSymbols
  registerRelationClass(klass: Class<Relation>) {
    // noinspection JSUnresolvedVariable
    if (this.relationClasses[klass.label]) {
      // noinspection JSUnresolvedVariable
      throw new Error('duplicate label error: ' + klass.label)
    }

    // noinspection JSUnresolvedVariable
    this.relationClasses[klass.label] = klass
  }
}
