//@flow
import type {QueryBuilder, Query} from './types';
import {v1 as neo4j} from 'neo4j-driver';
import * as R from 'ramda';
import debug from 'debug';

const log = debug('Agregate:Connection');

class Auth {
    auth: Object;

    constructor(auth) {
        this.auth = auth;
    }
}

class BasicAuth extends Auth {
    constructor(login: string, password: string) {
        super(neo4j.auth.basic(login, password));
    }
}

export class Connection {
    static basic = (...args) => new BasicAuth(...args);

    init: Promise<void, AgregateConnectionError>;

    constructor(host: string, auth: Auth, {cluster = false, readonly = false} = {}) {
        const uri = `${cluster ? 'bolt+routing' : 'bolt'}://${host}`;

        const driver = neo4j.driver(uri, auth.auth);
        //todo bring nifty tricks to protect API from writing clauses
        const session = driver.session(readonly ? 'READ' : 'WRITE');

        this.init = new Promise((res, rej) => {
            driver.onCompleted = (...args) => res([driver, session]);
            driver.onError = (err) => {
                const getErrCode = R.path(['fields', 0, 'code']);
                log(err.fields);
                switch (getErrCode(err)) {
                    case 'Neo.ClientError.Security.Unauthorized':
                        rej(new Error(err.fields[0].message));
                        break;
                    default:
                        rej(new Error('unknown error encountered'));
                        break;
                }
            };
        })
            .then(([driver, session]) => {
                this.driver = driver;
                this.session = session;
            })

        // trick to disable default catch when any other .catch is executed
        this.init.catch(err => log('connection error encountered for', host, auth, err));
    }

    async close() {
        await this.init.catch(err => err);
        await new Promise(res => this.session.close(res));
        this.driver.close();
    }

    async query(query: string | Query | QueryBuilder) {
        if (typeof query === 'string')
            return this.query({statement: query});
        if (query.toJSON instanceof Function)
            return this.query(query.toJSON());

        await this.init;

        const {statement, parameters} = query;
        const {records} = await this.session.run(statement, this.dehydrate(parameters));
        return this.rehydrate(records.map(({_fields}) => _fields));
    }

    rehydrate(value) {
        return value;
    }

    dehydrate(value) {
        return value;
    }
}