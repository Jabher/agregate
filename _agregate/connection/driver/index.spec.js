import chai, { expect } from "chai"
import { Driver } from "./index"
import cap from "chai-as-promised"
chai.use(cap)

describe("Agregate Driver", () => {
  describe("connectivity", () => {
    it("should successfully connect on proper login/password pair", async () => {
      const driver = new Driver("localhost", Driver.basic("neo4j", "password"))
      expect(driver.init).to.eventually.equal(undefined)
      await driver.close()
    })

    it("should fail on wrong login/password pair", async () => {
      const driver = new Driver(
        "localhost",
        Driver.basic("neo4j", "wrong password")
      )
      try {
        await driver.init

        // noinspection ExceptionCaughtLocallyJS
        throw new Error("error not thrown")
      } catch (err) {
        expect(err.message).to.include("authentication failure")
      }

      // optional for usage,
      // but this test also checks whether driver.close on bad credentials do not throw an error
      await driver.close()
    })
  })

  describe("querying", () => {
    let driver
    beforeEach(async () => {
      driver = new Driver("localhost", Driver.basic("neo4j", "password"))
      driver.query("match (a) detach delete a")
    })

    afterEach(async () => {
      await driver.close()
    })

    it("should perform simple query", async () => {
      const result = await driver.query('return "foo"')
      expect(result).to.deep.equal([["foo"]])
    })

    it("should perform query with multiple results", async () => {
      const result = await driver.query('return "foo", "bar"')
      expect(result).to.deep.equal([["foo", "bar"]])
    })

    it("should perform query with object", async () => {
      const [[node]] = await driver.query("create (a:Test) return a")
      expect(node).to.deep.equal({
        labels: ["Test"],
        properties: {},
        __type: "node"
      })
    })

    it("should perform query with object and object params", async () => {
      const [[node]] = await driver.query(
        'create (a:Test {foo: "bar"}) return a'
      )
      expect(node).to.deep.equal({
        labels: ["Test"],
        properties: { foo: "bar" },
        __type: "node"
      })
    })

    it("should perform query with objects", async () => {
      await driver.query("create (:Test {i: 1})")
      await driver.query("create (:Test {i: 2})")
      const result = await driver.query("match (a:Test) return a")
      expect(result).to.have.length(2)
    })

    it("should perform query with relation", async () => {
      const [[rel]] = await driver.query(
        'merge (a:Test)-[r:TestRel {foo: "baz"}]->(b:Test) return r'
      )
      expect(rel).to.deep.equal({
        labels: ["TestRel"],
        properties: { foo: "baz" },
        __type: "relation",
        start: undefined,
        end: undefined
      })
    })

    it("should perform query with relation and data", async () => {
      const [
        [rel]
      ] = await driver.query(`merge (a:Test {from: true})-[r:TestRel]->(b:Test {to: true}) 
            return r, a, b`)
      expect(rel).to.deep.equal({
        labels: ["TestRel"],
        properties: {},
        __type: "relation",
        start: {
          __type: "node",
          properties: { from: true },
          labels: ["Test"]
        },
        end: {
          __type: "node",
          properties: { to: true },
          labels: ["Test"]
        }
      })
    })

    it("should perform resolve trick with nodes", async () => {
      driver.resolveNode = val => ({ isNode: true, foo: val.properties.foo })
      const [[node]] = await driver.query(
        'create (a:Test {foo: "bar"}) return a'
      )
      expect(node).to.deep.equal({
        isNode: true,
        foo: "bar"
      })
    })

    it("should perform resolve trick with relations", async () => {
      driver.resolveRelation = val => ({
        isRelation: true,
        foo: val.properties.foo
      })
      const [[rel]] = await driver.query(
        'merge (a:Test)-[r:TestRel {foo: "baz"}]->(b:Test) return r'
      )
      expect(rel).to.deep.equal({
        start: undefined,
        end: undefined,
        isRelation: true,
        foo: "baz"
      })
    })
  })
})
