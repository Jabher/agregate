/*
 Important note: this is very small part of all tests,
 which is covering only the unexpected cases that cannot be obviously placed in any other folder.
 Check for all .spec.js files for other tests
 * */

import 'babel-polyfill';
import chai, {expect} from 'chai';
import {Cypher} from './cypher';

import {Connection, Record as RefRecord} from './';
import spies from 'chai-spies';
chai.use(spies);
const connection = new Connection('localhost', {username: 'neo4j', password: 'password'});

class Record extends RefRecord {
    static async save(...props) { return await Promise.all(props.map(opts => new this(opts).save())) }

    static connection = connection;
}

describe('ActiveRecord', () => {
    class Test extends Record {}
    before(async () =>
        await Test.register())

    beforeEach(async () =>
        await connection.query(Cypher.tag`MATCH (n) DETACH DELETE n`))

    describe('misc bugs - should be re-spreaded into everything else', () => {
        it('should not reset into instance properties', async () => {
            class Test2 extends Test {
                foo = 'bar';
            }

            const t = new Test2();
            t.foo = 'baz';
            await t.save();
            expect(t.foo).to.equal('baz');
        })
        it('should have access to class methods in hooks', async () => {
            class Test2 extends Test {
                bar() { return 'bar'; }

                async beforeCreate() {
                    this.foo = this.bar();
                }
            }

            const t = new Test2();
            await t.save();
            expect(t.foo).to.equal('bar');
        })
    })
})