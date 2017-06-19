import * as R from "ramda"

import { Connection, Record } from "./"
const connection = new Connection("localhost", {
  username: "neo4j",
  password: "password"
})

class Test extends Record {
  static indexes = ["i"]
  static connection = connection
}

describe("performance-based matters", () => {
  before(async () => {
    await Test.register()
  })

  // it('should provide satisfying performance on 50 parallel create queries per second or higher', async () => {
  //   await Promise.all(R.range(0, 1000).map((i) => new Test({ i }).save()));
  // }).timeout(20000);

  it(
    "should provide satisfying performance on 50 sequential create queries per second or higher",
    async () => {
      for (const i of R.range(0, 1000)) {
        await new Test({ i }).save()
      }
    }
  ).timeout(20000)

  it(
    "should provide satisfying performance on 50 search queries per second or higher",
    async () => {
      for (const i of R.range(0, 1000)) {
        await Test.where({ i })
      }
    }
  ).timeout(20000)
})
