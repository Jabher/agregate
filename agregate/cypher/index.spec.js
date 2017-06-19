import { Cypher, Session } from "./index";

describe("Cypher Query builder", () => {
  it("should generate session var names", () => {
    const s = new Session()
    s.alphabet = ["a", "b"]
    expect(s.seedToString()).toEqual('a')
    expect(s.seedToString()).toEqual('b')
    expect(s.seedToString()).toEqual('a0')
    expect(s.seedToString()).toEqual('b0')
    expect(s.seedToString()).toEqual('a1')
  })

  it("should create query", () => {
    expect(Cypher.tag`test`.toJSON()).toEqual({
      statement: "test",
      parameters: {}
    })
  })
  it("should create query with string param", () => {
    expect(Cypher.tag`test${"testVar"}`.toJSON())
      .toEqual({
        statement: `test{a}`,
        parameters: { a: "testVar" }
      })
  })
  it("should create query with raw data", () => {
    expect(Cypher.raw`test`.toJSON())
      .toEqual({
        statement: `test`,
        parameters: {}
      })
  })
  it("should create query with raw data and variables", () => {
    expect(Cypher.raw`test${"Var"}`.toJSON())
      .toEqual({
        statement: `testVar`,
        parameters: {}
      })
  })
  it("should create query with raw data and cypher tag interpolated", () => {
    expect(Cypher.raw`test${Cypher.tag`Var${1}`}`.toJSON())
      .toEqual({
        statement: `testVar1`,
        parameters: {}
      })
  })
  it("should create query with query param", () => {
    expect(Cypher.tag`test${Cypher.tag`${"testVar"}`}`.toJSON())
      .toEqual({
        statement: `test{a}`,
        parameters: { a: "testVar" }
      })
  })
  it("should create query with array param", () => {
    const arr = ["test"]
    expect(Cypher.tag`test${Cypher.tag`${arr}`}`.toJSON())
      .toEqual({
        statement: `test{a}`,
        parameters: { a: arr }
      })
  })
  it("should create query with spread param", () => {
    const arr = ["spread", Cypher.raw`raw`]
    expect(Cypher.tag`test${Cypher.spread(arr)}`.toJSON())
      .toEqual({
        statement: `test{a}raw`,
        parameters: { a: arr[0] }
      })
  })
  it("should create query with literal param", () => {
    expect(Cypher.tag`test ${Cypher.literal({ foo: 1 })}`.toJSON())
      .toEqual({
        statement: `test foo:{a}`,
        parameters: { a: 1 }
      })
  })
})
