import { actions, Connection, Model, Reference } from "./index";

const connection = new Connection('localhost', { username: 'neo4j', password: 'password' });

describe('Agregate usage examples', () => {
  class Demo extends Model {
    static references = {
      entities: new Reference.Any(Demo, 'relatesTo')
    }
  }
  class DemoSubject extends Model {
    static references = {
      demo: new Reference.Any(Demo, 'relatesTo', {single: true})
    }
  }
  class DemoObject extends Model {
    static references = {
      demo: new Reference.Any(Demo, 'relatesTo', {single: true})
    }
  }

  beforeEach(async () => {
    await connection.register(Demo.collection)
    await connection.register(DemoSubject.collection)
    await connection.register(DemoObject.collection)
  })

  beforeEach(async () => {
    await connection.run(
      actions.delete(Demo.collection),
      actions.delete(DemoSubject.collection),
      actions.delete(DemoObject.collection)
    )
  })

  it('should support querying the element', async () => {
    await new Demo({
      number: 1,
      string: 'foo'
    }).create.run(connection)
    await new Demo({
      number: 2,
      string: 'bar'
    }).create.run(connection)

    const items = await Demo.collection.order('number ASC').run(connection)

    expect(items).toHaveLength(2)
    expect(items[0]).toBeInstanceOf(Demo)
    expect(items[1]).toBeInstanceOf(Demo)
    expect(items[0]).toMatchObject({
      number: 1,
      string: 'foo'
    })
    expect(items[1]).toMatchObject({
      number: 2,
      string: 'bar'
    })
  })

  it('should support createUnlessExists', async () => {
    const demo1 = await new Demo({
      number: 1,
      string: 'foo'
    }).createUnlessExists.run(connection)

    const demo2 = await new Demo({
      number: 2,
      string: 'bar'
    }).createUnlessExists.run(connection)

    expect(demo1.node_).toEqual(demo2.node_)
  })

  it('should update already created elements', async () => {
    const demo1 = new Demo({ number: 1, string: 'foo' })

    const demo2 = await demo1.create.run(connection)

    expect(demo1).toEqual(demo2)
  })

  it('should support creating the reference for the element', async () => {
    const demo = await new Demo({ type: 'demo' }).create.run(connection)
    const demoSubject = await new DemoSubject({ type: 'demo', demo }).create.run(connection)

    expect(demoSubject.entities).toEqual([demo])
  })

  it('should support querying the element by reference #1', async () => {
    const demo = await new Demo({ type: 'demo' }).create.run(connection)
    await new DemoSubject({ type: 'demo', demo }).create.run(connection)



    expect(demoSubject.entities).toEqual([demo])
  })
})