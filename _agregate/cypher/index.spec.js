import { expect } from "chai"
import { Cypher } from "./index"

describe("Cypher Query _agregate", () => {
  it("should create query", () => {
    expect(Cypher.tag`test`.toJSON()).to.deep.equal({
      statement: "test",
      parameters: {}
    })
  })
  it("should create query with string param", () => {
    expect(Cypher.tag`test${"testVar"}`.toJSON()).to.deep.equal({
      statement: `test{${Cypher.defaultPrefix}0}`,
      parameters: { [`${Cypher.defaultPrefix}0`]: "testVar" }
    })
  })
  it("should create query with query param", () => {
    expect(Cypher.tag`test${Cypher.tag`${"testVar"}`}`.toJSON()).to.deep.equal({
      statement: `test{${Cypher.defaultPrefix}0_0}`,
      parameters: { [`${Cypher.defaultPrefix}0_0`]: "testVar" }
    })
  })
  it("should create query with array param", () => {
    const arr = ["test", Cypher.raw("test2")]
    expect(Cypher.tag`test${Cypher.tag`${arr}`}`.toJSON()).to.deep.equal({
      statement: `test{${Cypher.defaultPrefix}0_0}test2`,
      parameters: { [`${Cypher.defaultPrefix}0_0`]: arr }
    })
  })
})
