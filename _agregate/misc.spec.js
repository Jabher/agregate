/*
 Important note: this is very small part of all tests,
 which is covering only the unexpected cases that cannot be obviously placed in any other folder.
 Check for all .spec.js files for other tests
 * */

import "./polyfill"
import chai, { expect } from "chai"
import { Cypher } from "./cypher"

import { Connection, Record as RefRecord, Relation } from "./"
import spies from "chai-spies"
chai.use(spies)
const connection = new Connection("localhost", {
  username: "neo4j",
  password: "password"
})

class Record extends RefRecord {
  static async save(...props) {
    return await Promise.all(props.map(opts => new this(opts).save()))
  }

  static connection = connection
}

describe("Agregate", () => {
  class Test extends Record {}
  beforeEach(async () => {
    connection.__resetResolver()
    await connection.query(Cypher.tag`MATCH (n) DETACH DELETE n`)
    await Test.register()
  })

  describe("misc bugs - should be re-spreaded into everything else", () => {
    it("should not reset into instance properties", async () => {
      class Test2 extends Test {
        foo = "bar"
      }

      const t = new Test2()
      t.foo = "baz"
      await t.save()
      expect(t.foo).to.equal("baz")
    })
    it("should have access to class methods in hooks", async () => {
      class Test2 extends Test {
        bar() {
          return "bar"
        }

        async beforeCreate() {
          this.foo = this.bar()
        }
      }

      const t = new Test2()
      await t.save()
      expect(t.foo).to.equal("bar")
    })
    it("should keep instance properties unless other values are provided", async () => {
      class Test2 extends Test {
        foo = new Relation(this, "foo")
      }
      await Test2.register()
      await new Test2({ baz: true }).save()
      const [res] = await Test2.where({ baz: true })
      expect(res.foo).to.deep.include({ label: "foo" })
    })
    it("should contain uuid in dump", async () => {
      const test = new Test()
      await test.save()
      expect(test.toJSON()).to.have.property("uuid")
    })
  })
})
