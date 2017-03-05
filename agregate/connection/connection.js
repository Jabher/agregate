// @flow
import '../polyfill';
import type {DBProperties} from '../types';
import {Driver} from './driver';
import {Record} from '../record';
import {Relation} from '../relation';
import {Cypher as C} from '../cypher';
import debug from 'debug';
import {v1 as neo4j} from 'neo4j-driver';
import * as R from 'ramda';
import * as s from '../symbols';

type ConnectionInit = {
    username: string;
    password: string;
}

const log = debug('Agregate:Connection');

export class Connection extends Driver {
    relationClasses: {[key: string]: Class<Record>} = Object.create(null);
    recordClasses: {[key: string]: Class<Relation>} = Object.create(null);

    __init = Promise;

    constructor(host: string,init: ConnectionInit) {
        super(host,Driver.basic(init.username,init.password));
        this.__init = this.init;
        this.init = this.__init
            .then(() => this.__startQueueInitQueryLoop())
            .then(() => log('all init queries successfully executed'))
    }

    resolveRelation(value: {type: string,properties: DBProperties}) {
        const {type,properties} = value;
        const relationClass = this.relationClasses[type];
        if (relationClass) {
            return Reflect.construct(Relation,[properties,[ type ]],relationClass)
        } else {
            return super.resolveRelation(value);
        }
    }

    resolveNode(value: neo4j.types.Node): Object {
        const {labels,properties} = value;
        const recordClasses = labels.map(label => this.recordClasses[label]).filter(klass => klass);
        if (recordClasses.length === 1) {
            const record = Reflect.construct(Record,[properties,labels],recordClasses[0])
            record[s.node] = value;
            return record;
        } else if (recordClasses.length === 0) {
            return super.resolveNode(value);
        } else {
            console.warn('resolver is confused. Multiple classes do match single db node',value);
            throw new Error('resolver got confused');
        }
    }

    __initQueriesQueue: C[] = [];

    __queueInitQuery(query: C): void {
        debug('adding new init query',query);
        this.__initQueriesQueue.push(query);
        this.__startQueueInitQueryLoop().catch(err => log('queue loop error',err));
    }

    __queueInitQueryLoopRunning = false;

    async __startQueueInitQueryLoop(): Promise<void> {
        if (this.__queueInitQueryLoopRunning)            {return;}
        this.__queueInitQueryLoopRunning = true;
        await this.__init;
        if (this.__initQueriesQueue[0])            {
            await this.query(this.__initQueriesQueue.shift())
                .catch(e => {
                    if (R.path(['fields',0,'code'],e) === 'Neo.ClientError.Schema.IndexAlreadyExists') {

                        // do nothing, that's totally fine
                    } else {
                        log('error on queue start',e)
                    }
                });
        }
        this.__queueInitQueryLoopRunning = false;
        if (this.__initQueriesQueue.length > 0)            {await this.__startQueueInitQueryLoop();}
    }

    registerRecordClass(klass: Class<Record>,label: string = klass.label,indices: string[] = klass.indices): void {
        if (this.recordClasses[label])            {throw new Error('duplicate label error: ' + label);}

        this.recordClasses[label] = klass;

        this.__queueInitQuery(C.tag`CREATE CONSTRAINT ON (entity:${C.raw(label)}) ASSERT entity.uuid IS UNIQUE`);
        for (const index of indices)            {this.__queueInitQuery(C.tag`CREATE INDEX ON :${C.raw(label)}(${C.raw(index)})`);}
    }

    registerRelationClass(klass: Class<Relation>) {
        if (this.relationClasses[klass.label])            {throw new Error('duplicate label error: ' + klass.label);}

        this.relationClasses[klass.label] = klass;
    }
}
