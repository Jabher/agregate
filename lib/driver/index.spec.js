//@flow
import chai, {expect} from 'chai';
import {Connection} from './index';
import cap from 'chai-as-promised';
chai.use(cap);

describe('Connection', () => {
    describe.only('connectivity', () => {
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
        })
    })

})