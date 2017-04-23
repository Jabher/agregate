import * as R from 'ramda';
import { expect } from 'chai';

import { Connection, Record } from './';
const connection = new Connection('localhost', { username: 'neo4j', password: 'password' });

class Test extends Record {
    static indexes = ['i'];
    static connection = connection;
}


describe('performance-based matters', () => {
    before(async () => {
        await Test.register();
    });

    it('should provide satisfying performance on 100 parallel create queries per second or higher', async () => {
        await Promise.all(R.range(0, 1000).map((i) => new Test({i}).save()));
    }).timeout(10000);

    it('should provide satisfying performance on 100 sequential create queries per second or higher', async () => {
        for (const i of R.range(0, 1000)) {
            await new Test({i}).save();
        }
    }).timeout(10000);

    it('should provide satisfying performance on 100 search queries per second or higher', async () => {
        for (const i of R.range(0, 1000)) {
            await Test.where({i});
        }
    }).timeout(10000);
});