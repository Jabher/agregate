import * as R from "ramda";
import { expect } from "chai";

import { Connection, Record } from "./";
import { acceptsTransaction } from './index';

const connection = new Connection('localhost', { username: 'neo4j', password: 'password' });

class Test extends Record {
  static indexes = ['i'];
  static connection = connection;
}

class Test2 extends Record {
  static connection = connection;

  @acceptsTransaction
  async tick() {
    await new Promise(res => setTimeout(res, 100))
    return Test2.firstWhere({}, this.connection)
  }


  @acceptsTransaction
  async tack() {
    return Test2.firstWhere({}, this.connection)
  }
}


describe('performance-based matters', () => {
  before(async () => {
    await Test.register();
  });

  it('should provide satisfying performance on 50 sequential create queries per second or higher', async () => {
    for (const i of R.range(0, 1000)) {
      await new Test({ i }).save();
    }
  }).timeout(20000);

  it('should provide satisfying performance on 50 search queries per second or higher', async () => {
    for (const i of R.range(0, 1000)) {
      await Test.where({ i });
    }
  }).timeout(20000);

  it('should support concurrent queries in transaction', async () => {
    const tx = await Test2.connection.transaction()
    expect(await Promise.all([
      new Test2().tick(tx),
      new Test2().tack(tx)
    ])).to.deep.equal([undefined, undefined])
  })
});