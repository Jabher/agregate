//@flow
import chai, {expect} from 'chai';
import {Connection} from './index';
import cap from 'chai-as-promised';
chai.use(cap);

describe('Connection', () => {
    describe('connectivity', () => {
        it('should successfully connect on proper login/password pair', async () => {
            const connection = new Connection('localhost', Connection.basic('neo4j', 'password'));
            expect(connection.init).to.eventually.equal(undefined);
            await connection.close();
        })
        it('should fail on wrong login/password pair', async () => {
            const connection = new Connection('localhost', Connection.basic('neo4j', 'wrong password'));
            try {
                await connection.init;
                //noinspection ExceptionCaughtLocallyJS
                throw new Error('error not thrown');
            } catch (err) {
                expect(err.message).to.include('authentication failure');
            }
            // optional for usage,
            // but this test also checks whether connection.close on bad credentials do not throw an error
            await connection.close();
        })
    })
    describe.only('querying', () => {
        let connection;
        beforeEach(async () => {
            connection = new Connection('localhost', Connection.basic('neo4j', 'password'));
            connection.query('match (a) detach delete a')
        })

        afterEach(async () => {
            await connection.close();
        })

        it('should perform simple query', async () => {
            const result = await connection.query('return "foo"');
            expect(result).to.deep.equal([['foo']]);
        })

        it('should perform query with multiple results', async () => {
            const result = await connection.query('return "foo", "bar"');
            expect(result).to.deep.equal([['foo', 'bar']]);
        })

        it('should perform query with object', async () => {
            const result = await connection.query('create (a:Test) return a');
            expect(result).to.deep.equal([[1]]);
        })

        it('should perform query with object and ', async () => {
            const result = await connection.query('create (a:Test) return a');
            expect(result).to.deep.equal([[1]]);
        })

        it('should perform query with objects', async () => {
            await connection.query('create (a:Test) create (b:Test)');
            const result = await connection.query('match (a:Test) return a');
            expect(result).to.deep.equal([[1]]);
        })
    })
})